/**
 * The `<mj-ballot>` custom element component. WCAG 2.2 AA accessible, mobile-first.
 * Real Shadow DOM isolation, no MJ core imports.
 *
 * States: 'init' → 'login' | 'ready' → 'reviewing' → 'casting' → 'cast' | 'closed' | 'error'
 *
 * Session: token extracted from #t=... hash (single-use), removed via history.replaceState.
 * Stored only in memory (never localStorage/cookies). Host assertion (RS256) from attribute.
 *
 * Checklist implementation:
 * (1) Review + explicit Confirm - (line ~400)
 * (2) Ranked move up/down - (line ~650)
 * (3) Approval/plurality MaxSelections - (line ~680)
 * (4) Abstain when allowed - (line ~700)
 * (5) Write-in text - (line ~720)
 * (6) StandardsItem comments - (line ~750)
 * (7) UX validation - (line ~850)
 * (8) Receipt + copy - (line ~430)
 * (9) Results after cast - (line ~450)
 * (10) Second-factor + host-assertion - (line ~350)
 * (11) Iframe postMessage - (line ~880)
 * (12) Token memory-only + fragment cleanup - (line ~320)
 * (13) aria-live + fieldset/legend + reduced-motion - (templates + CSS)
 * (14) Overridable strings - (line ~290)
 */

import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ViewEncapsulation,
  signal,
  effect,
  ChangeDetectionStrategy,
  ElementRef,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  ValidateSubmission,
  type BallotStyle,
  type BallotStyleContest,
  type BallotStyleOption,
  type CommentType,
  type BallotSubmission,
  type ContestSubmission,
  type OptionSelection,
} from '@mj-biz-apps/voting-entities/contracts';
import { BallotApiError, GENERIC_ERROR_MESSAGE } from './api/ballot-api.client';
import type { VotingContestOutcome, VotingTallyOptionResult } from './api/ballot-api.types';
import {
  BallotFlow,
  BuildContestComments,
  CommentDraftKey,
  EmptyCommentDraft,
  GENERAL_COMMENT_KEY,
  RequiredCommentOptionIDs,
  resolveLanguage,
  type CommentDraft,
  type ResultsView,
} from './api/ballot-flow';
import { BALLOT_CONFIG } from './widget-providers';

type BallotState = 'init' | 'login' | 'ready' | 'reviewing' | 'casting' | 'cast' | 'voted' | 'closed' | 'error';

interface BallotStrings {
  loading: string;
  loadingBallot: string;
  error: string;
  unableToLoad: string;
  noCredentials: string;
  reviewYourBallot: string;
  pleasReview: string;
  backToEditing: string;
  castBallot: string;
  castSuccessfully: string;
  yourReceiptCode: string;
  saveCodeToVerify: string;
  copyClipboard: string;
  ballotClosed: string;
  votingNoLongerOpen: string;
  selectOneOption: string;
  selectUpTo: string;
  selectInOrder: string;
  abstain: string;
  addChoice: string;
  comment: string;
  currentResults: string;
  signIn: string;
  sourceKey: string;
  pin: string;
  hostAssertion: string;
  pleaseFixIssues: string;
  cancel: string;
  reviewAndCast: string;
  generalComment: string;
  commentType: string;
  documentReference: string;
  commentText: string;
  proposedChange: string;
  alreadyVoted: string;
  alreadyVotedBody: string;
  previousReceipt: string;
  resultsNotAvailable: string;
  finalResults: string;
  votesCast: string;
  ballotsCounted: string;
  votesLabel: string;
}

const DEFAULT_STRINGS: BallotStrings = {
  loading: 'Loading...',
  loadingBallot: 'Loading ballot...',
  error: 'Error',
  unableToLoad: 'Unable to Load Ballot',
  noCredentials: 'No voting credentials provided.',
  reviewYourBallot: 'Review Your Ballot',
  pleasReview: 'Please review your selections carefully before casting your ballot.',
  backToEditing: 'Back to Editing',
  castBallot: 'Cast Ballot',
  castSuccessfully: 'Ballot Cast Successfully',
  yourReceiptCode: 'Your Receipt Code:',
  saveCodeToVerify: 'Save this code to verify your ballot was counted.',
  copyClipboard: 'Copy to Clipboard',
  ballotClosed: 'Ballot Is Closed',
  votingNoLongerOpen: 'Voting is no longer open for this election.',
  selectOneOption: 'Select one option',
  selectUpTo: 'Select up to',
  selectInOrder: 'Select options in order of preference',
  abstain: 'Abstain',
  addChoice: 'Add another choice...',
  comment: 'Comment:',
  currentResults: 'Current Results',
  signIn: 'Sign In',
  sourceKey: 'Voter ID or Reference',
  pin: 'PIN or Date of Birth',
  hostAssertion: 'You are already signed in',
  pleaseFixIssues: 'Please fix the following issues:',
  cancel: 'Cancel',
  reviewAndCast: 'Review & Cast Ballot',
  generalComment: 'General comment (optional)',
  commentType: 'Comment type',
  documentReference: 'Document reference (optional)',
  commentText: 'Comment',
  proposedChange: 'Proposed change (optional)',
  alreadyVoted: 'You Have Already Voted',
  alreadyVotedBody: 'Your ballot has been recorded. Thank you for voting.',
  previousReceipt: 'Your previous receipt code (you may vote again to replace your ballot):',
  resultsNotAvailable: 'Results are not available yet.',
  finalResults: 'Final Results',
  votesCast: 'Votes cast',
  ballotsCounted: 'Ballots counted',
  votesLabel: 'votes',
};

@Component({
  selector: 'mj-ballot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ballot-container" [attr.data-state]="state()">
      <!-- Loading -->
      <div *ngIf="state() === 'init'" class="ballot-loading" role="status" aria-live="polite" aria-label="Loading">
        <div class="spinner"></div>
        <p>{{ strings.loadingBallot }}</p>
      </div>

      <!-- Login (second-factor or host-assertion) -->
      <div *ngIf="state() === 'login'" class="ballot-login">
        <div class="login-form">
          <h2>{{ strings.signIn }}</h2>
          <p *ngIf="showHostAssertion" class="host-assertion-notice">
            {{ strings.hostAssertion }}
          </p>
          <p *ngIf="loginError()" class="login-error" role="alert">{{ loginError() }}</p>
          <div *ngIf="showSecondFactor" class="second-factor-form">
            <div class="form-group">
              <label for="sourceKey">{{ strings.sourceKey }}</label>
              <input id="sourceKey" type="text" [(ngModel)]="secondFactorSourceKey" />
            </div>
            <div class="form-group">
              <label for="pin">{{ strings.pin }}</label>
              <input id="pin" type="password" [(ngModel)]="secondFactorPin" />
            </div>
            <button (click)="submitSecondFactor()" class="btn-submit">{{ strings.signIn }}</button>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div *ngIf="state() === 'error'" class="ballot-error" role="alert">
        <h2>{{ strings.error }}</h2>
        <p>{{ errorMessage() }}</p>
      </div>

      <!-- Ready: ballot form -->
      <div *ngIf="state() === 'ready'" class="ballot-content">
        <div class="ballot-header">
          <h1>{{ ballotStyle()?.ElectionName }}</h1>
          <p *ngIf="ballotStyle()?.Description" class="description">{{ ballotStyle()?.Description }}</p>
        </div>

        <p *ngIf="receiptCode()" class="previous-receipt">{{ strings.previousReceipt }} <code>{{ receiptCode() }}</code></p>

        <form (submit)="onSubmit($event)" class="ballot-form">
          <div *ngFor="let contest of ballotStyle()?.Contests" class="contest">
            <fieldset>
              <legend [id]="'contest-' + contest.ContestID">
                <h2>{{ contest.Name }}</h2>
                <p *ngIf="contest.Description" class="contest-description">{{ contest.Description }}</p>
              </legend>

              <p class="contest-instructions">
                <span *ngIf="contest.IsRanked">{{ strings.selectInOrder }}</span>
                <span *ngIf="!contest.IsRanked && contest.MaxSelections === 1">{{ strings.selectOneOption }}</span>
                <span *ngIf="!contest.IsRanked && contest.MaxSelections > 1">
                  {{ strings.selectUpTo }} {{ contest.MaxSelections }} {{ strings.selectInOrder }}
                </span>
              </p>

              <!-- Ranked: draggable/keyboard-operable list -->
              <div *ngIf="contest.IsRanked" class="ranked-selections" role="list">
                <div
                  *ngFor="let sel of getContestSelections(contest.ContestID); let i = index"
                  class="ranked-item"
                  role="listitem"
                >
                  <span class="rank" aria-label="Position {{ i + 1 }}">{{ i + 1 }}</span>
                  <span class="label">{{ getOptionLabel(contest, sel.OptionID) }}</span>
                  <button
                    type="button"
                    (click)="moveSelectionUp(contest.ContestID, i)"
                    [disabled]="i === 0"
                    class="btn-move"
                    [attr.aria-label]="'Move ' + getOptionLabel(contest, sel.OptionID) + ' up'"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    (click)="moveSelectionDown(contest.ContestID, i)"
                    [disabled]="i === getContestSelections(contest.ContestID).length - 1"
                    class="btn-move"
                    [attr.aria-label]="'Move ' + getOptionLabel(contest, sel.OptionID) + ' down'"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    (click)="removeSelection(contest.ContestID, i)"
                    class="btn-remove"
                    [attr.aria-label]="'Remove ' + getOptionLabel(contest, sel.OptionID)"
                  >
                    ✕
                  </button>
                </div>

                <div *ngIf="getContestSelections(contest.ContestID).length < contest.MaxSelections" class="add-selection">
                  <select (change)="addSelection(contest.ContestID, $event)">
                    <option value="">{{ strings.addChoice }}</option>
                    <option
                      *ngFor="let opt of getAvailableOptions(contest)"
                      [value]="opt.OptionID"
                    >
                      {{ opt.Label }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Approval/plurality: checkboxes/radios respecting MaxSelections -->
              <div *ngIf="!contest.IsRanked" class="selection-options" role="group">
                <div *ngFor="let option of contest.Options" class="option">
                  <input
                    [type]="contest.MaxSelections === 1 ? 'radio' : 'checkbox'"
                    [id]="option.OptionID"
                    [name]="contest.ContestID"
                    [value]="option.OptionID"
                    (change)="onOptionChange(contest.ContestID, option.OptionID, $event)"
                    [checked]="isOptionSelected(contest.ContestID, option.OptionID)"
                    [disabled]="!canSelectOption(contest, option.OptionID)"
                  />
                  <label [for]="option.OptionID">
                    <span class="label-text">{{ option.Label }}</span>
                    <span *ngIf="option.Description" class="option-description">{{ option.Description }}</span>
                  </label>

                  <!-- Write-in input for write-in options -->
                  <div *ngIf="option.IsWriteIn && isOptionSelected(contest.ContestID, option.OptionID)" class="write-in">
                    <input
                      type="text"
                      placeholder="Enter name..."
                      [value]="getWriteInText(contest.ContestID, option.OptionID)"
                      (change)="setWriteInText(contest.ContestID, option.OptionID, $event)"
                      [attr.aria-label]="'Write-in for ' + option.Label"
                    />
                  </div>
                </div>
              </div>

              <!-- Abstain -->
              <div *ngIf="contest.AllowAbstain" class="abstain-option">
                <input
                  type="checkbox"
                  [id]="'abstain-' + contest.ContestID"
                  (change)="toggleAbstain(contest.ContestID, $event)"
                  [checked]="isAbstaining(contest.ContestID)"
                />
                <label [for]="'abstain-' + contest.ContestID">{{ strings.abstain }}</label>
              </div>

              <!-- Comments (StandardsItem): one box per selected option that requires a comment, plus an optional general one -->
              <div class="comments-section">
                <div *ngFor="let optionId of requiredCommentOptions(contest)" class="comment-input">
                  <ng-container *ngTemplateOutlet="commentTpl; context: { contest: contest, key: optionId, title: strings.comment + ' ' + getOptionLabel(contest, optionId) }"></ng-container>
                </div>
                <div *ngIf="contest.Kind === 'StandardsItem'" class="comment-input">
                  <ng-container *ngTemplateOutlet="commentTpl; context: { contest: contest, key: generalKey, title: strings.generalComment }"></ng-container>
                </div>
              </div>
            </fieldset>
          </div>

          <!-- UX validation errors -->
          <div *ngIf="validationErrors().length" class="validation-errors" role="alert" aria-live="assertive">
            <h3>{{ strings.pleaseFixIssues }}</h3>
            <ul>
              <li *ngFor="let error of validationErrors()">{{ error.Message }}</li>
            </ul>
          </div>

          <!-- Submit button -->
          <div class="ballot-actions">
            <button
              type="submit"
              class="btn-submit"
              [disabled]="formValid() === false"
              [attr.aria-label]="strings.reviewAndCast"
            >
              {{ strings.reviewAndCast }}
            </button>
            <button type="button" (click)="onCancel()" class="btn-cancel">{{ strings.cancel }}</button>
          </div>
        </form>
      </div>

      <!-- Reviewing state: explicit Confirm before Cast -->
      <div *ngIf="state() === 'reviewing'" class="review-modal" role="alertdialog">
        <div class="review-content">
          <h2>{{ strings.reviewYourBallot }}</h2>
          <p>{{ strings.pleasReview }}</p>

          <div class="review-summary">
            <div *ngFor="let contest of ballotStyle()?.Contests" class="review-contest">
              <h3>{{ contest.Name }}</h3>
              <div *ngFor="let sel of getContestSelections(contest.ContestID)" class="review-selection">
                {{ getOptionLabel(contest, sel.OptionID) }}
                <span *ngIf="sel.Rank">(rank: {{ sel.Rank }})</span>
                <span *ngIf="sel.WriteInText">(write-in: {{ sel.WriteInText }})</span>
              </div>
              <p *ngIf="isAbstaining(contest.ContestID)" class="review-abstain">{{ strings.abstain }}</p>
            </div>
          </div>

          <p class="clickjacking-control" aria-label="Click the Cast Ballot button to confirm">
            <strong>Click the "{{ strings.castBallot }}" button below to confirm and cast your ballot.</strong>
          </p>

          <div class="review-actions">
            <button type="button" (click)="backToEditing()" class="btn-back">{{ strings.backToEditing }}</button>
            <button
              type="button"
              (click)="confirmCast()"
              class="btn-confirm"
              [disabled]="state() === 'casting'"
              [attr.aria-label]="strings.castBallot"
            >
              {{ strings.castBallot }}
            </button>
          </div>
        </div>
      </div>

      <!-- Cast state: receipt + results -->
      <div *ngIf="state() === 'cast'" class="ballot-receipt">
        <h2>{{ strings.castSuccessfully }}</h2>
        <div *ngIf="receiptCode()" class="receipt-code">
          <label>{{ strings.yourReceiptCode }}</label>
          <code>{{ receiptCode() }}</code>
          <button type="button" (click)="copyReceiptCode()" class="btn-copy">{{ strings.copyClipboard }}</button>
        </div>
        <p *ngIf="receiptCode()" class="receipt-info">{{ strings.saveCodeToVerify }}</p>
        <ng-container *ngTemplateOutlet="resultsTpl"></ng-container>
      </div>

      <!-- Already voted (and not allowed to revote) -->
      <div *ngIf="state() === 'voted'" class="ballot-receipt" role="status">
        <h2>{{ strings.alreadyVoted }}</h2>
        <p>{{ strings.alreadyVotedBody }}</p>
        <div *ngIf="receiptCode()" class="receipt-code">
          <label>{{ strings.yourReceiptCode }}</label>
          <code>{{ receiptCode() }}</code>
          <button type="button" (click)="copyReceiptCode()" class="btn-copy">{{ strings.copyClipboard }}</button>
        </div>
        <ng-container *ngTemplateOutlet="resultsTpl"></ng-container>
      </div>

      <ng-template #commentTpl let-contest="contest" let-key="key" let-title="title">
        <fieldset class="comment-fieldset">
          <legend>{{ title }}</legend>
          <label [for]="commentId(contest.ContestID, key, 'type')">{{ strings.commentType }}</label>
          <select
            [id]="commentId(contest.ContestID, key, 'type')"
            [value]="getDraft(contest.ContestID, key).CommentType"
            (change)="setDraftType(contest.ContestID, key, $event)"
          >
            <option value="General">General</option>
            <option value="Technical">Technical</option>
            <option value="Editorial">Editorial</option>
          </select>
          <label [for]="commentId(contest.ContestID, key, 'ref')">{{ strings.documentReference }}</label>
          <input
            type="text"
            [id]="commentId(contest.ContestID, key, 'ref')"
            [value]="getDraft(contest.ContestID, key).DocumentReference"
            (input)="setDraftField(contest.ContestID, key, 'DocumentReference', $event)"
          />
          <label [for]="commentId(contest.ContestID, key, 'text')">{{ strings.commentText }}</label>
          <textarea
            [id]="commentId(contest.ContestID, key, 'text')"
            [value]="getDraft(contest.ContestID, key).Comment"
            (input)="setDraftField(contest.ContestID, key, 'Comment', $event)"
          ></textarea>
          <label [for]="commentId(contest.ContestID, key, 'change')">{{ strings.proposedChange }}</label>
          <textarea
            [id]="commentId(contest.ContestID, key, 'change')"
            [value]="getDraft(contest.ContestID, key).ProposedChange"
            (input)="setDraftField(contest.ContestID, key, 'ProposedChange', $event)"
          ></textarea>
        </fieldset>
      </ng-template>

      <ng-template #resultsTpl>
        <div *ngIf="resultsView() as rv" class="results-section">
          <h3>{{ rv.IsFinal ? strings.finalResults : strings.currentResults }}</h3>
          <p *ngIf="!rv.Visible" class="results-hidden">{{ rv.Reason || strings.resultsNotAvailable }}</p>
          <div *ngIf="rv.Visible" class="results-content">
            <p *ngIf="rv.Output.BallotCount !== undefined" class="results-count">
              {{ strings.ballotsCounted }}: {{ rv.Output.BallotCount }}
            </p>
            <div *ngFor="let outcome of rv.Output.Contests" class="result-contest">
              <h4>{{ contestName(outcome) }}</h4>
              <p class="result-outcome">{{ outcome.Outcome }}</p>
              <ul class="result-options">
                <li *ngFor="let opt of outcome.Options">
                  {{ resultOptionLabel(outcome, opt) }}: {{ opt.Votes }} {{ strings.votesLabel }}
                  <span class="result-option-outcome">({{ opt.Outcome }})</span>
                </li>
              </ul>
              <p class="result-votes-cast">{{ strings.votesCast }}: {{ outcome.VotesCast }}</p>
            </div>
          </div>
        </div>
      </ng-template>

      <!-- Closed state -->
      <div *ngIf="state() === 'closed'" class="ballot-closed" role="alert">
        <h2>{{ strings.ballotClosed }}</h2>
        <p>{{ strings.votingNoLongerOpen }}</p>
      </div>
    </div>
  `,
  styles: `
    :host {
      --color-bg: #ffffff;
      --color-text: #000000;
      --color-border: #d0d0d0;
      --color-focus: #0066cc;
      --color-error: #dc3545;
      --color-success: #28a745;
    }

    @media (prefers-color-scheme: dark) {
      :host {
        --color-bg: #1a1a1a;
        --color-text: #ffffff;
        --color-border: #444444;
        --color-focus: #4d94ff;
        --color-error: #ff6b6b;
        --color-success: #51cf66;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        animation: none !important;
        transition: none !important;
      }
    }

    .ballot-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 1.5rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--color-bg);
      color: var(--color-text);
    }

    .ballot-loading,
    .ballot-login {
      text-align: center;
      padding: 2rem;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-focus);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .ballot-error,
    .ballot-closed {
      background-color: #fee;
      border: 1px solid var(--color-error);
      border-radius: 4px;
      padding: 1rem;
      color: var(--color-error);
    }

    .ballot-header {
      margin-bottom: 2rem;
    }

    .ballot-header h1 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }

    .description,
    .contest-description {
      margin: 0.25rem 0;
      opacity: 0.8;
      font-size: 0.95rem;
    }

    .contest {
      margin-bottom: 2rem;
      padding: 1rem;
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }

    fieldset {
      border: none;
      padding: 0;
      margin: 0;
    }

    legend {
      padding: 0;
      margin: 0 0 1rem;
    }

    legend h2 {
      margin: 0;
      font-size: 1.1rem;
    }

    .contest-instructions {
      margin: 0.5rem 0 1rem;
      font-size: 0.9rem;
      opacity: 0.8;
    }

    .selection-options {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin: 1rem 0;
    }

    .option {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .option input {
      margin-top: 0.25rem;
      cursor: pointer;
      accent-color: var(--color-focus);
    }

    .option label {
      cursor: pointer;
      flex: 1;
    }

    .label-text {
      display: block;
    }

    .option-description {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.85rem;
      opacity: 0.7;
    }

    .write-in {
      margin-top: 0.5rem;
      margin-left: 1.5rem;
    }

    .write-in input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }

    .ranked-selections {
      margin: 1rem 0;
    }

    .ranked-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      padding: 0.5rem;
      background-color: rgba(0, 102, 204, 0.05);
      border-radius: 4px;
    }

    .rank {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      background-color: var(--color-focus);
      color: white;
      border-radius: 50%;
      font-weight: bold;
      font-size: 0.8rem;
    }

    .ranked-item .label {
      flex: 1;
    }

    .btn-move,
    .btn-remove {
      padding: 0.25rem 0.5rem;
      background: none;
      border: 1px solid var(--color-border);
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.85rem;
    }

    .btn-move:hover:not(:disabled),
    .btn-remove:hover {
      background-color: var(--color-focus);
      color: white;
    }

    .btn-move:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .abstain-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 1rem 0;
      padding: 0.5rem;
      background-color: rgba(0, 0, 0, 0.02);
      border-radius: 4px;
    }

    .abstain-option input {
      cursor: pointer;
      accent-color: var(--color-focus);
    }

    .comments-section {
      margin-top: 1rem;
    }

    .comment-input {
      margin-bottom: 1rem;
    }

    .comment-input label {
      display: block;
      margin-bottom: 0.25rem;
      font-weight: 500;
    }

    .comment-input textarea {
      width: 100%;
      min-height: 60px;
      padding: 0.5rem;
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }

    .validation-errors {
      background-color: #fee;
      border: 1px solid var(--color-error);
      border-radius: 4px;
      padding: 1rem;
      margin: 1rem 0;
      color: var(--color-error);
    }

    .validation-errors h3 {
      margin: 0 0 0.5rem;
    }

    .validation-errors ul {
      margin: 0;
      padding-left: 1.5rem;
    }

    .ballot-actions,
    .review-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 2rem;
      flex-wrap: wrap;
    }

    .btn-submit,
    .btn-cancel,
    .btn-back,
    .btn-confirm,
    .btn-copy {
      padding: 0.75rem 1.5rem;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      background-color: var(--color-bg);
      color: var(--color-text);
      cursor: pointer;
      font-size: 1rem;
      font-weight: 500;
    }

    .btn-submit,
    .btn-confirm {
      background-color: var(--color-focus);
      color: white;
      border-color: var(--color-focus);
      flex: 1;
    }

    .btn-submit:hover:not(:disabled),
    .btn-confirm:hover:not(:disabled) {
      opacity: 0.9;
    }

    .btn-submit:disabled,
    .btn-confirm:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-cancel,
    .btn-back {
      flex: 1;
    }

    .review-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .review-content {
      background-color: var(--color-bg);
      border-radius: 8px;
      padding: 2rem;
      max-width: 500px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .review-content h2 {
      margin-top: 0;
    }

    .review-summary {
      margin: 1rem 0;
      max-height: 300px;
      overflow-y: auto;
    }

    .review-contest {
      margin-bottom: 1rem;
    }

    .review-contest h3 {
      margin: 0 0 0.5rem;
      font-size: 1rem;
    }

    .review-selection,
    .review-abstain {
      padding: 0.25rem 0.5rem;
      background-color: rgba(0, 102, 204, 0.1);
      border-radius: 3px;
      margin: 0.25rem 0;
    }

    .clickjacking-control {
      font-weight: bold;
      margin: 1rem 0;
    }

    .ballot-receipt {
      text-align: center;
      padding: 2rem;
    }

    .receipt-code {
      margin: 1.5rem 0;
      padding: 1rem;
      background-color: rgba(40, 167, 69, 0.1);
      border-radius: 4px;
    }

    .receipt-code code {
      display: block;
      font-family: 'Courier New', monospace;
      font-size: 1.2rem;
      font-weight: bold;
      margin: 0.5rem 0;
      letter-spacing: 0.1em;
    }

    .btn-copy {
      margin-top: 0.5rem;
      background-color: var(--color-success);
      color: white;
      border-color: var(--color-success);
    }

    .btn-copy:hover {
      opacity: 0.9;
    }

    .results-section {
      margin-top: 2rem;
      padding-top: 2rem;
      border-top: 1px solid var(--color-border);
    }

    .login-error {
      color: var(--color-error);
    }

    .result-options {
      padding-left: 1.25rem;
    }

    .login-form {
      max-width: 300px;
      margin: 0 auto;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .form-group input {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid var(--color-border);
      border-radius: 4px;
    }

    @media (max-width: 600px) {
      .ballot-container {
        padding: 1rem;
      }

      .ballot-actions {
        flex-direction: column;
      }

      .btn-submit,
      .btn-cancel,
      .btn-back,
      .btn-confirm {
        flex: 1 1 auto;
      }

      .review-modal {
        padding: 1rem;
      }

      .review-content {
        padding: 1rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class MjBallotComponent implements OnInit, OnChanges, OnDestroy {
  @Input() slug = '';
  /** Explicit ballot language. Empty means the distribution's DefaultLanguage (else 'en'). */
  @Input() language = '';
  @Input() stringOverrides: Partial<BallotStrings> = {};

  // State
  state = signal<BallotState>('init');
  errorMessage = signal('');
  loginError = signal('');
  ballotStyle = signal<BallotStyle | null>(null);
  receiptCode = signal('');
  resultsView = signal<ResultsView | null>(null);
  formValid = signal<boolean | null>(null);
  validationErrors = signal<Array<{ ContestID?: string; Code: string; Message: string }>>([]);

  // Login (second-factor)
  showSecondFactor = false;
  showHostAssertion = false;
  secondFactorSourceKey = '';
  secondFactorPin = '';

  /** Resolved strings (item 14: overridable); evaluated on read so inputs set after construction apply. */
  get strings(): BallotStrings {
    return { ...DEFAULT_STRINGS, ...this.stringOverrides };
  }

  // Private state
  private readonly config = inject(BALLOT_CONFIG);
  private flow: BallotFlow | null = null;
  private resolvedLanguage = 'en';
  private ballotSubmission = signal<BallotSubmission>({ Contests: [] });
  private commentDrafts = new Map<string, CommentDraft>();
  readonly generalKey = GENERAL_COMMENT_KEY;
  private started = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {
    // Watch for changes and validate
    effect(() => {
      this.ballotStyle();
      this.validateForm();
    });

    // Handle iframe postMessage
    this.setupIframeMessaging();
  }

  ngOnInit(): void {
    this.started = true;
    void this.initializeBallot();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.started || changes['slug']?.firstChange) return;
    if (changes['slug']) {
      void this.initializeBallot();
    } else if (changes['language'] && this.flow?.ElectionID && this.state() === 'ready') {
      void this.loadBallot();
    }
  }

  ngOnDestroy(): void {
    // Cleanup
  }

  private async initializeBallot(): Promise<void> {
    this.state.set('init');
    try {
      this.flow = new BallotFlow(this.config, this.slug);
      const info = await this.flow.LoadInfo();
      this.resolvedLanguage = resolveLanguage(this.language || this.config.language, info);

      // Extract token from #t=... and remove it (item 12: token in memory only). It is the emailed-link credential.
      const token = this.extractTokenFromHash();
      const hostAssertion = this.config.hostAssertion ?? this.getHostAssertionFromAttribute();

      if (token) {
        await this.signInAndLoad('emailed-link', { Token: token });
      } else if (hostAssertion) {
        await this.signInAndLoad('host-assertion', { Assertion: hostAssertion });
      } else if (info.AllowedMethods.includes('second-factor')) {
        this.showSecondFactor = true;
        this.state.set('login');
      } else {
        this.fail(this.strings.noCredentials);
      }
    } catch (error) {
      this.failFrom(error);
    }
  }

  private extractTokenFromHash(): string | null {
    // Item 12: token only in memory, fragment removed
    const match = typeof location !== 'undefined' ? location.hash.match(/#t=([^&]+)/) : null;
    if (match?.[1]) {
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return decodeURIComponent(match[1]);
    }
    return null;
  }

  private getHostAssertionFromAttribute(): string | null {
    return this.elementRef.nativeElement.getAttribute('host-assertion');
  }

  private async signInAndLoad(methodCode: string, credential: { Token?: string; Assertion?: string; SecondFactor?: { SourceKey: string; Pin: string } }): Promise<void> {
    if (!this.flow) return;
    await this.flow.SignIn(methodCode, credential);
    await this.loadBallot();
  }

  /** GetMyBallot -> ballot, or the already-voted state. */
  private async loadBallot(): Promise<void> {
    if (!this.flow) return;
    try {
      const view = await this.flow.LoadMyBallot(this.resolvedLanguage);
      if (view.Kind === 'voted') {
        this.receiptCode.set(view.ReceiptCode ?? '');
        if (view.Style) this.ballotStyle.set(view.Style);
        this.state.set('voted');
        this.dispatchCustomEvent('ballot-state-change', { state: 'voted' });
        await this.loadResults();
        return;
      }
      const ballot = view.Style;
      this.receiptCode.set(view.PreviousReceiptCode ?? '');
      this.ballotStyle.set(ballot);
      this.commentDrafts.clear();
      this.ballotSubmission.set({
        Contests: ballot.Contests.map((c) => ({ ContestID: c.ContestID, Selections: [], Comments: [] })),
      });
      this.state.set('ready');
      this.dispatchCustomEvent('ballot-state-change', { state: 'ready' });
    } catch (error) {
      this.failFrom(error);
    }
  }

  /** Results are optional chrome: any failure just leaves them hidden. */
  private async loadResults(): Promise<void> {
    if (!this.flow) return;
    try {
      this.resultsView.set(await this.flow.LoadResults());
    } catch {
      this.resultsView.set(null);
    }
  }

  async submitSecondFactor(): Promise<void> {
    // Item 10: second-factor sign-in
    if (!this.secondFactorSourceKey || !this.secondFactorPin) {
      return;
    }
    this.loginError.set('');
    this.state.set('init');
    try {
      await this.flow?.SignIn('second-factor', {
        SecondFactor: { SourceKey: this.secondFactorSourceKey, Pin: this.secondFactorPin },
      });
    } catch (error) {
      // Stay on the sign-in form so the voter can try again; the edge's text is fixed and carries no input.
      this.secondFactorPin = '';
      this.loginError.set(error instanceof BallotApiError ? error.message : GENERIC_ERROR_MESSAGE);
      this.state.set('login');
      return;
    }
    await this.loadBallot();
  }

  private fail(message: string): void {
    this.state.set('error');
    this.errorMessage.set(message);
    this.dispatchCustomEvent('ballot-error', { message });
  }

  /** Handled refusals and edge refusals carry safe text; everything else is generic. */
  private failFrom(error: unknown): void {
    this.fail(error instanceof BallotApiError ? error.message : GENERIC_ERROR_MESSAGE);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    if (this.state() === 'ready' && this.formValid() === true) {
      this.state.set('reviewing');
      this.dispatchCustomEvent('ballot-state-change', { state: 'reviewing' });
    }
  }

  backToEditing(): void {
    this.state.set('ready');
    this.dispatchCustomEvent('ballot-state-change', { state: 'ready' });
  }

  confirmCast(): void {
    // Item 1: explicit confirm before cast
    if (this.state() !== 'reviewing') {
      return;
    }
    this.state.set('casting');
    void this.castBallot();
  }

  private async castBallot(): Promise<void> {
    const style = this.ballotStyle();
    try {
      if (!this.flow || !style) {
        throw new BallotApiError('transport', GENERIC_ERROR_MESSAGE);
      }
      const receipt = await this.flow.Cast(style, this.ballotSubmission(), this.resolvedLanguage);
      this.receiptCode.set(receipt ?? '');

      // Item 9: show results after cast if visible
      await this.loadResults();

      this.state.set('cast');
      this.dispatchCustomEvent('ballot-cast', { electionId: this.flow.ElectionID, receiptCode: receipt ?? '' });
    } catch (error) {
      this.failFrom(error);
    }
  }

  // Results rendering helpers
  contestName(outcome: VotingContestOutcome): string {
    return this.ballotStyle()?.Contests.find((c) => c.ContestID === outcome.ContestID)?.Name ?? outcome.ContestID;
  }

  resultOptionLabel(outcome: VotingContestOutcome, option: VotingTallyOptionResult): string {
    const contest = this.ballotStyle()?.Contests.find((c) => c.ContestID === outcome.ContestID);
    return contest?.Options.find((o) => o.OptionID === option.OptionID)?.Label ?? option.OptionID;
  }

  onCancel(): void {
    this.dispatchCustomEvent('ballot-close', {});
  }

  copyReceiptCode(): void {
    // Item 8: receipt with copy button
    const code = this.receiptCode();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
    }
  }

  // Item 2: ranked move up/down
  moveSelectionUp(contestId: string, index: number): void {
    if (index <= 0) return;
    this.swapSelections(contestId, index, index - 1);
  }

  moveSelectionDown(contestId: string, index: number): void {
    const selections = this.getContestSelections(contestId);
    if (index >= selections.length - 1) return;
    this.swapSelections(contestId, index, index + 1);
  }

  private swapSelections(contestId: string, i: number, j: number): void {
    const submission = this.ballotSubmission();
    const contest = submission.Contests.find((c) => c.ContestID === contestId);
    if (!contest) return;
    [contest.Selections[i], contest.Selections[j]] = [contest.Selections[j], contest.Selections[i]];
    this.commitSubmission(submission);
  }

  removeSelection(contestId: string, index: number): void {
    const submission = this.ballotSubmission();
    const contest = submission.Contests.find((c) => c.ContestID === contestId);
    if (!contest) return;
    contest.Selections.splice(index, 1);
    this.commitSubmission(submission);
  }

  addSelection(contestId: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const optionId = select.value;
    if (!optionId) return;

    const submission = this.ballotSubmission();
    const contest = submission.Contests.find((c) => c.ContestID === contestId);
    if (!contest) return;

    // Item 2: for ranked, rank is position + 1
    const rank = this.getContestStyle(contestId)?.IsRanked ? contest.Selections.length + 1 : undefined;
    contest.Selections.push({ OptionID: optionId, Rank: rank });
    this.commitSubmission(submission);

    select.value = '';
  }

  // Item 3: approval/plurality honoring MaxSelections
  onOptionChange(contestId: string, optionId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const submission = this.ballotSubmission();
    const contest = submission.Contests.find((c) => c.ContestID === contestId);
    if (!contest) return;

    if (input.checked) {
      // Item 3: check MaxSelections
      const style = this.getContestStyle(contestId);
      if (style && contest.Selections.length >= style.MaxSelections) {
        input.checked = false;
        return;
      }
      contest.Selections.push({ OptionID: optionId });
    } else {
      const idx = contest.Selections.findIndex((s) => s.OptionID === optionId);
      if (idx >= 0) contest.Selections.splice(idx, 1);
    }
    this.commitSubmission(submission);
  }

  // Item 4: abstain when AllowAbstain
  toggleAbstain(contestId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const submission = this.ballotSubmission();
    const contest = submission.Contests.find((c) => c.ContestID === contestId);
    if (!contest) return;

    if (input.checked) {
      contest.Abstain = true;
      contest.Selections = [];
    } else {
      contest.Abstain = false;
    }
    this.commitSubmission(submission);
  }

  isAbstaining(contestId: string): boolean {
    return this.ballotSubmission().Contests.find((c) => c.ContestID === contestId)?.Abstain || false;
  }

  // Item 5: write-in text on IsWriteIn options
  getWriteInText(contestId: string, optionId: string): string {
    const submission = this.ballotSubmission();
    const contest = submission.Contests.find((c) => c.ContestID === contestId);
    if (!contest) return '';
    const sel = contest.Selections.find((s) => s.OptionID === optionId);
    return sel?.WriteInText || '';
  }

  setWriteInText(contestId: string, optionId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const submission = this.ballotSubmission();
    const contest = submission.Contests.find((c) => c.ContestID === contestId);
    if (!contest) return;

    const sel = contest.Selections.find((s) => s.OptionID === optionId);
    if (sel) sel.WriteInText = input.value;
    this.commitSubmission(submission);
  }

  // Item 6: StandardsItem comments
  requiredCommentOptions(contest: BallotStyleContest): string[] {
    return RequiredCommentOptionIDs(contest, this.getContestSelections(contest.ContestID));
  }

  commentId(contestId: string, key: string, field: string): string {
    return `comment-${contestId}-${key || 'general'}-${field}`;
  }

  getDraft(contestId: string, key: string): CommentDraft {
    return this.commentDrafts.get(CommentDraftKey(contestId, key)) ?? EmptyCommentDraft();
  }

  setDraftType(contestId: string, key: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as CommentType;
    this.updateDraft(contestId, key, { CommentType: value });
  }

  setDraftField(contestId: string, key: string, field: 'DocumentReference' | 'Comment' | 'ProposedChange', event: Event): void {
    this.updateDraft(contestId, key, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  private updateDraft(contestId: string, key: string, patch: Partial<CommentDraft>): void {
    this.commentDrafts.set(CommentDraftKey(contestId, key), { ...this.getDraft(contestId, key), ...patch });
    this.commitSubmission(this.ballotSubmission());
  }

  /** Publish the submission with every contest's Comments recomputed from the current selections and drafts. */
  private commitSubmission(submission: BallotSubmission): void {
    const style = this.ballotStyle();
    for (const contest of submission.Contests) {
      const styleContest = style?.Contests.find((c) => c.ContestID === contest.ContestID);
      if (styleContest) contest.Comments = BuildContestComments(styleContest, contest.Selections, this.commentDrafts);
    }
    this.ballotSubmission.set({ ...submission });
  }

  // Item 7: UX validation via ValidateSubmission
  private validateForm(): void {
    const style = this.ballotStyle();
    const submission = this.ballotSubmission();

    if (!style) {
      this.formValid.set(null);
      return;
    }

    const errors = ValidateSubmission(style, submission);
    this.validationErrors.set(errors);
    this.formValid.set(errors.length === 0);
  }

  // Helpers
  getContestSelections(contestId: string): OptionSelection[] {
    const contest = this.ballotSubmission().Contests.find((c) => c.ContestID === contestId);
    return contest?.Selections || [];
  }

  getAvailableOptions(contest: BallotStyleContest): BallotStyleOption[] {
    const selectedIds = new Set(this.getContestSelections(contest.ContestID).map((s) => s.OptionID));
    return contest.Options.filter((o: BallotStyleOption) => !selectedIds.has(o.OptionID));
  }

  getOptionLabel(contest: BallotStyleContest, optionId: string): string {
    return contest.Options.find((o: BallotStyleOption) => o.OptionID === optionId)?.Label || '';
  }

  isOptionSelected(contestId: string, optionId: string): boolean {
    return this.getContestSelections(contestId).some((s) => s.OptionID === optionId);
  }

  canSelectOption(contest: BallotStyleContest, optionId: string): boolean {
    const selected = this.getContestSelections(contest.ContestID).length;
    return selected < contest.MaxSelections || this.isOptionSelected(contest.ContestID, optionId);
  }

  private getContestStyle(contestId: string): BallotStyleContest | undefined {
    return this.ballotStyle()?.Contests.find((c) => c.ContestID === contestId);
  }

  // Item 11: iframe postMessage
  private setupIframeMessaging(): void {
    if (typeof window === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const height = this.elementRef.nativeElement.offsetHeight;
      const parentOrigin = ParentFrameOrigin();
      if (parentOrigin) {
        window.parent.postMessage({ type: 'mj-ballot-height', height }, parentOrigin);
      }
    });

    observer.observe(this.elementRef.nativeElement);
  }

  // Event dispatch with no personal data
  private dispatchCustomEvent(eventName: string, detail: Record<string, unknown> = {}): void {
    if (typeof window === 'undefined') return;

    // Item 11: relay events in iframe
    const parentOrigin = ParentFrameOrigin();
    if (parentOrigin) {
      window.parent.postMessage({ type: 'mj-ballot-event', name: eventName, detail }, parentOrigin);
    }

    const event = new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true,
    });

    this.elementRef.nativeElement.dispatchEvent(event);
  }
}

/**
 * The embedding page's origin when the ballot runs in an iframe, taken from the referrer; null when
 * not framed or when the origin can't be known. Messages go to that origin only — never '*' — so no
 * other page can read the height or the events. The edge's frame-ancestors CSP already limits which
 * origins can frame the ballot at all.
 */
export function ParentFrameOrigin(): string | null {
  if (typeof window === 'undefined' || !window.parent || window.parent === window) return null;
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    const origin = new URL(document.referrer).origin;
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}
