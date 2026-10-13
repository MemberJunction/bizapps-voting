# Operations runbook

Procedures for running Voting. Everything here was checked against the code; where a procedure is not supported yet, it
says so.

## Selections key (`VOTING_SELECTIONS_KEY`)

Tier A selections are AES-256-GCM encrypted under this key (base64 of exactly 32 bytes). Generate one with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and keep it in your secrets store, never in
the database or the repo.

- **Production** (`NODE_ENV=production`): a missing or malformed key makes casting fail closed (`KeyMissing` / `KeyInvalid`);
  tallies of tier A elections fail the same way.
- **Elsewhere**: a derived development key is used, with a logged warning. Ballots written under it can only be read
  with it.
- **There is no key rotation.** The key is not stored per election or per ballot: every tier A ballot is decrypted with
  whatever key MJAPI holds when the tally runs. Changing the key while any tier A ballot exists makes those ballots
  undecryptable (`BadCiphertext`). Rotate only when no tier A election has uncounted ballots, and keep every retired key as
  long as its elections may be re-tallied.
- Back the key up separately from database backups. Whoever holds both can read ballots.

## Trustee ceremony (tier B)

The election's `AssuranceTier` is `HighAssurance`; `ResultsTiming` must be `AfterClose`.

1. **Before voting** (election in Draft or Ready): an administrator calls `Voting.CreateTrusteeKeys` with 2 or more
   distinct `TrusteePersonIDs` and a `Threshold` k (2..n). The server generates an RSA-3072 pair in memory, splits the
   private key with Shamir over GF(256), stores the public key, the threshold and a commitment per share, and discards the
   private key. The response carries each trustee's share **once**; nothing stores it. Hand each share to its trustee
   out-of-band and do not log or email it. `OpenElection` refuses a tier B election without keys.
2. **Voting**: ballots are encrypted to the public key (`v1:b:`). Nobody, including the server, can decrypt them.
3. **After close**: each trustee, signed in as their own MJ user (their linked Person must match the trustee), calls
   `Voting.SubmitKeyShare` with `ShareIndex` and `Share`. The share is verified against its commitment and held in
   process memory. When k shares are held, the key is reconstructed and checked against the election's public key; a set
   that does not reconstruct it is discarded and the trustees resubmit.
4. **Tally**: an administrator calls `Voting.Tally`. Without k shares on this instance it fails with a message saying how
   many are held; submit the shares, then tally again. Once the tally is written (or its save fails) the shares and key are wiped from memory, so a
   re-tally needs the shares submitted again.

**Single instance.** Shares live in the memory of one MJAPI process. Every trustee must reach the same instance (sticky
routing or a single node), and a restart loses submitted shares (trustees resubmit). If fewer than k trustees can still produce
their share, the election cannot be tallied: trustee keys can be created only once per election (`KeysAlreadyCreated`).
There is no Explorer UI for the ceremony yet.

## Public edge limits

The ballot edge rate-limits `GET /vote/:slug`, `GET /vote/:slug/info` and `POST /vote/session` with a fixed window **held in
process memory** (see the embedding guide for the settings and defaults). Each MJAPI instance counts separately, so behind N
instances a client gets up to N times the allowance; put a shared limiter (reverse proxy or WAF) in front for real
protection. Set `TrustedProxyHops` to the number of proxies appending to `X-Forwarded-For`, otherwise every client behind
a proxy shares one IP.

The guard against guessing is the **durable per-credential lockout** in the database (`VoterCredential.FailedAttempts`,
`LockedUntil`; PIN credentials only, thresholds in the method's `Configuration`: `MaxFailedAttempts` 5,
`LockoutMinutes` 15), which every instance shares. Emailed-link tokens are 32 random bytes and single use.

## Sending ballots and reminders

- **Emailed links**: configure the `emailed-link` method's `Configuration` with `FromAddress` (optional `ProviderName`,
  `FromName`, `Subject`) and have an active MJ Communication provider that sends `Email`. Create an `Active`
  `BallotDistribution` (Settings dashboard), put the election in Ready or Open, then issue with `BaseUrl` set to the public
  origin (Settings, or the Credentials tab). The result reports `Issued` and `Skipped`; voters without an email on their
  Person, or when no sender is configured, are skipped.
- **Reminders**: enable the *Voting Reminder Sender* scheduled job (it ships Disabled) after setting `VOTING_EMAIL_PROVIDER`
  and `VOTING_EMAIL_FROM`, or `ProviderName` / `From` in the job's Configuration. It mails eligible voters who have not
  voted, once per threshold (days before close).

## Certification

1. The election is `Tallied`. If `ChallengeWindowEndsAt` is set, certification is refused until it has passed.
2. Each certifier (an administrator or Election Inspector with a linked Person) calls `Voting.Certify`. The first call
   creates the certification (roll hash, ballot-set hash, results-timing disclosure); each call adds one signature, once
   per person.
3. When `Configuration.RequiredCertifiers` (default 1) signatures exist, the certification and the election become
   `Certified` and the driver's `OnResultsCertified` runs. Until then the election stays `Tallied`.
4. If the roll or ballot set changes between signatures, certifying is refused (`HashMismatch`).

You can re-tally a `Tallied` election before certification; certified elections are final.

## Revotes

Only Open and Confidential elections can allow revotes (`AllowRevote`; Secret elections never do). A revote keeps the
voter's `Participation`, marks the previous ballot `Superseded` (found through `BallotAttribution`), adds the new ballot,
and corrects the running tally. Only `Counted` ballots are tallied.

## Audit

Events are appended to `ElectionAuditEvent` (created, updated, opened, closed, cancelled, roll frozen or amended,
challenges, credentials issued, tally, certification, key events, running-results views under `AdministratorsOnly`).
Rows are append-only. `ActorUserID` is the acting MJ user for administrator actions; guest sessions and the system user are
recorded with no actor. Details hold counts, ids and codes, never ballot content. A failure to write an audit row is logged
and does not undo the action.

## Backup and recovery

- Back up the database after close and before the tally; ballots are insert-only apart from the supersede flag on revotes.
- A failed tally leaves the election `Closed` (the tally writes everything in one transaction, so a failure rolls back);
  fix the cause and tally again with the same `TieBreakSeed` to reproduce tie-breaks (the seed used is recorded in the
  audit event and on each `ContestResult`).
- Restoring a database does not restore trustee shares held in memory or revoke credentials issued since; reissue links
  (a new link replaces the old).
- Wrong results before certification: fix the cause and `Voting.Tally` again; the previous final result is demoted.
