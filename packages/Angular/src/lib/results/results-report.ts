/**
 * Printable election results report. Built as a standalone HTML document and printed from its own
 * window, so Explorer's chrome never leaks into the printout and the report keeps working in any
 * theme. Colours use CSS system colours only (no hard-coded hex).
 */
import type { VotingContestOutcome } from '@mj-biz-apps/voting-entities';
import type { ContestResultMeta } from './contest-outcome.component';

export interface CertifierView {
    ID: string;
    PersonName: string;
    Role: string;
    SignedAt: Date | null;
}

export interface CertificationView {
    ID: string;
    Status: string;
    CertifiedAt: Date | null;
    RollHash: string;
    BallotSetHash: string;
    ResultsTimingDisclosure: string;
    Notes: string;
    Certifiers: CertifierView[];
}

export interface ReportContest {
    Meta: ContestResultMeta;
    Outcome: VotingContestOutcome;
}

export interface ReportData {
    ElectionName: string;
    ElectionStatus: string;
    ResultsTimingText: string;
    IsRunning: boolean;
    IsFinal: boolean;
    SnapshotAt: string | null;
    BallotCount: number | null;
    Contests: ReportContest[];
    Certification: CertificationView | null;
}

export function EscapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function FormatDate(d: Date | string | null): string {
    if (!d) {
        return 'n/a';
    }
    const date = d instanceof Date ? d : new Date(d);
    return Number.isNaN(date.getTime()) ? String(d) : date.toLocaleString();
}

function ContestSection(c: ReportContest): string {
    const label = (id: string): string => EscapeHtml(c.Meta.OptionLabels[id.toLowerCase()] ?? id);
    const options = [...c.Outcome.Options].sort((a, b) => a.Position - b.Position);
    const rows = options
        .map(
            (o) =>
                `<tr><td>${o.Position}</td><td>${label(o.OptionID)}</td><td class="num">${Number(o.Votes.toFixed(5))}</td><td>${EscapeHtml(o.Outcome)}</td></tr>`
        )
        .join('');
    const rounds = (c.Outcome.Rounds ?? [])
        .map((r) => {
            const tallies = options
                .map((o) => `<td class="num">${r.Tallies[o.OptionID] === undefined ? '' : Number(r.Tallies[o.OptionID].toFixed(5))}</td>`)
                .join('');
            return `<tr><td>${r.Round}</td>${tallies}<td>${r.Elected.map(label).join(', ')}</td><td>${r.Excluded.map(label).join(', ')}</td></tr>`;
        })
        .join('');
    const roundsTable = rounds
        ? `<h4>Counting rounds</h4><table><thead><tr><th>Round</th>${options
              .map((o) => `<th>${label(o.OptionID)}</th>`)
              .join('')}<th>Elected</th><th>Excluded</th></tr></thead><tbody>${rounds}</tbody></table>`
        : '';
    const notes = (c.Outcome.Notes ?? []).map((n) => `<li>${EscapeHtml(n)}</li>`).join('');
    return `<section class="contest">
<h3>${EscapeHtml(c.Meta.Name)} <span class="outcome">${EscapeHtml(c.Outcome.Outcome)}</span></h3>
<p class="meta">${EscapeHtml(c.Meta.Kind)}, ${c.Meta.Seats} seat(s), ${EscapeHtml(c.Meta.TallyMethodName)}. ${c.Outcome.VotesCast} ballots counted, ${c.Outcome.Abstentions} abstentions${c.Outcome.TieBroken ? ', a tie was broken' : ''}.</p>
<table><thead><tr><th>#</th><th>Option</th><th class="num">Votes</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>
${roundsTable}
${notes ? `<ul>${notes}</ul>` : ''}
</section>`;
}

function CertificationSection(cert: CertificationView): string {
    const certifiers = cert.Certifiers.map(
        (p) => `<tr><td>${EscapeHtml(p.PersonName)}</td><td>${EscapeHtml(p.Role)}</td><td>${EscapeHtml(FormatDate(p.SignedAt))}</td></tr>`
    ).join('');
    return `<section class="cert">
<h2>Certification</h2>
<dl>
<dt>Status</dt><dd>${EscapeHtml(cert.Status)}</dd>
<dt>Certified at</dt><dd>${EscapeHtml(FormatDate(cert.CertifiedAt))}</dd>
<dt>Voter roll hash</dt><dd><code>${EscapeHtml(cert.RollHash || 'n/a')}</code></dd>
<dt>Ballot set hash</dt><dd><code>${EscapeHtml(cert.BallotSetHash || 'n/a')}</code></dd>
<dt>Results timing disclosure</dt><dd>${EscapeHtml(cert.ResultsTimingDisclosure || 'n/a')}</dd>
${cert.Notes ? `<dt>Notes</dt><dd>${EscapeHtml(cert.Notes)}</dd>` : ''}
</dl>
${certifiers ? `<table><thead><tr><th>Certifier</th><th>Role</th><th>Signed</th></tr></thead><tbody>${certifiers}</tbody></table>` : '<p>No certifiers have signed.</p>'}
</section>`;
}

export function BuildReportHtml(data: ReportData): string {
    const banner = data.IsRunning
        ? `<p class="banner">Running results. Snapshot ${EscapeHtml(FormatDate(data.SnapshotAt))}, ${data.BallotCount ?? 0} ballots in. Voting is still open; these are not final.</p>`
        : data.IsFinal
          ? ''
          : '<p class="banner">These results are not final.</p>';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${EscapeHtml(data.ElectionName)} - Results</title>
<style>
:root { color-scheme: light; }
body { font-family: system-ui, sans-serif; color: CanvasText; background: Canvas; margin: 2rem; line-height: 1.4; }
h1 { margin: 0 0 0.25rem; } h2 { margin-top: 2rem; } h3 { margin-bottom: 0.25rem; } h4 { margin: 1rem 0 0.25rem; }
.meta, .generated { color: GrayText; margin: 0.25rem 0 0.5rem; }
.banner { border: 2px solid CanvasText; padding: 0.5rem 0.75rem; font-weight: 600; }
.outcome { font-size: 0.8rem; border: 1px solid CanvasText; border-radius: 999px; padding: 0.1rem 0.6rem; margin-left: 0.5rem; vertical-align: middle; }
table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; }
th, td { border: 1px solid GrayText; padding: 0.3rem 0.5rem; text-align: left; }
th { font-weight: 700; } .num { text-align: right; }
dl { display: grid; grid-template-columns: 14rem 1fr; gap: 0.25rem 1rem; }
dt { font-weight: 700; } dd { margin: 0; word-break: break-all; }
.contest { break-inside: avoid; margin-bottom: 1.5rem; }
@media print { body { margin: 0.5in; } }
</style></head><body>
<h1>${EscapeHtml(data.ElectionName)}</h1>
<p class="generated">Election status: ${EscapeHtml(data.ElectionStatus)}. Results timing: ${EscapeHtml(data.ResultsTimingText)}. Report generated ${EscapeHtml(new Date().toLocaleString())}.</p>
${banner}
<h2>Results</h2>
${data.Contests.map(ContestSection).join('\n')}
${data.Certification ? CertificationSection(data.Certification) : '<p class="generated">This election has not been certified.</p>'}
</body></html>`;
}

/**
 * Opens the report in a new window and prints it. Returns false when the browser blocked the
 * window (pop-up blocker), so the caller can tell the user.
 */
export function PrintReport(html: string): boolean {
    const win = window.open('', '_blank', 'width=900,height=1000');
    if (!win) {
        return false;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Give the document a tick to lay out before the print dialog opens.
    setTimeout(() => {
        try {
            win.print();
        } catch {
            // the user may already have closed the window
        }
    }, 400);
    return true;
}
