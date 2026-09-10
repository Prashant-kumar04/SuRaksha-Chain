# TEST-CASES.md

## TC1 — Tamper & Drift Verification Case

Fictional manual verification dataset. Created: 2026-09-10T05:29:04.273Z
The files below are real files on disk. Hashes were computed from their original bytes at creation time. The tamper file was not modified or pre-flagged.

- Case ID: f4bbf83d-0986-4926-99f1-3fb63525b098
- FIR number: TC1-MANUAL-TAMPER-DRIFT
- Case title: TC1 — Tamper & Drift Verification Case
- Category: SENSITIVE_WOMEN_SAFETY
- IO assignment: io@suraksha.gov.in (WRITE)
- READ assignments: forensic@suraksha.gov.in, prosecutor@suraksha.gov.in
- Court Officer and Admin use normal elevated role access; no special grants were created.

## Physical Files and Baseline Hashes

| Test File | Real disk path | Document ID | Original SHA-256 |
|---|---|---|---|
| TC1_TAMPER_TEST.txt | C:\Users\acer\Downloads\suraksha-chain\uploads\1da2f681-1af2-4edc-bcc6-cc9fa9799ac9_TC1_TAMPER_TEST.txt | 3d48e3eb-b6f9-4e01-a311-11a03ecd7225 | e903a7b1b386e21463d5ebd21c37bb1665f80875fbc5116fac45f38196654e90 |
| TC1_VERSION_CHAIN.txt v1 | C:\Users\acer\Downloads\suraksha-chain\uploads\89ba7052-eb47-4976-816a-9a5a27611284_TC1_VERSION_CHAIN.txt | 5cbd6d4a-046f-4b82-9107-accdad57ebd4 | 79e457b646db1e2dda37c8109354395b6d97c163a3cbecc9411784220b3e5779 |
| TC1_VERSION_CHAIN.txt v2 | C:\Users\acer\Downloads\suraksha-chain\uploads\63ef3797-2996-40e2-9aba-985134c58440_TC1_VERSION_CHAIN.txt | 5cbd6d4a-046f-4b82-9107-accdad57ebd4 | 4fc9d7cc4138a2f634ff2d72da278350a78ab3078b694a4eb484f1e0653fd4c0 |
| TC1_VERSION_CHAIN.txt v3 | C:\Users\acer\Downloads\suraksha-chain\uploads\a9657c21-1d9d-4436-a7a9-5a10f7e2e8a2_TC1_VERSION_CHAIN.txt | 5cbd6d4a-046f-4b82-9107-accdad57ebd4 | fcccc739bd9fba85ab9620bbb39f43c03c520a204bf66b4ab7e80c716fecefd5 |
| TC1_SEALED_RECORD.txt | C:\Users\acer\Downloads\suraksha-chain\uploads\587cce6b-a525-4677-89c0-b8586d58e0a9_TC1_SEALED_RECORD.txt | 563d6904-8a20-4d43-a32a-dc14c1f9a621 | cb1427e82dfc2e633f6ab20cc6dfdb045682b1df9983af69efb49fa7fa5cdcb1 |

Database upload paths are relative to uploads/. The absolute paths above are the files to open.

### Exact Original Content

#### TC1_TAMPER_TEST.txt

Forensic Report Reference ID: TC1-FR-001
DNA Match Probability: 0.02%
Conclusion: Sample excluded from match.

#### TC1_VERSION_CHAIN.txt

v1: Witness statement: Suspect wore a blue jacket.
v2: Witness statement: Suspect wore a dark blue jacket.
v3: Witness statement: Suspect wore a red jacket and carried a bag.

#### TC1_SEALED_RECORD.txt

Medical examination record — restricted.

## Manual Test Table

| Test File | What to do | Who does it | Expected result |
|---|---|---|---|
| TC1_TAMPER_TEST.txt | Open the physical file, change exactly one character (for example 0.02% to 0.03%), save without using the app, then run Verify File. Do not alter it before the baseline test. | Any assigned role | Stored hash remains e903a7b1b386e21463d5ebd21c37bb1665f80875fbc5116fac45f38196654e90; actual hash differs; integrity FAIL / tamper flagged. |
| TC1_VERSION_CHAIN.txt v1->v2 | Compare v1 with v2 in Version Drift Check. | Any assigned role | No drift flag. |
| TC1_VERSION_CHAIN.txt v2->v3 | Compare v2 with v3. | Any assigned role | DRIFT FLAG for meaningful change. |
| TC1_SEALED_RECORD.txt before order | Try to access/download before an approved order exists. | IO | HTTP 403; sealed content blocked. |
| TC1_SEALED_RECORD.txt after order | IO submits request; Court Officer attaches a fictional order and approves it; IO retries. | IO, then Court Officer | IO can access after approval. |
| TC1_SEALED_RECORD.txt unauthorized approval | Attempt attach/approve as Forensic Expert or Prosecutor. | Forensic Expert or Prosecutor | HTTP 403; court-only action blocked server-side. |
| TC1_VICTIM_RECORD | View the record. | IO, Forensic Expert, Prosecutor | Name, address, and contact are REDACTED. |
| TC1_VICTIM_RECORD | View the record. | Court Officer, Admin | UNREDACTED full record. |

## Version Chain Records

| Version | Stored physical file | SHA-256 | Expected drift |
|---|---|---|---|
| v1 | C:\Users\acer\Downloads\suraksha-chain\uploads\89ba7052-eb47-4976-816a-9a5a27611284_TC1_VERSION_CHAIN.txt | 79e457b646db1e2dda37c8109354395b6d97c163a3cbecc9411784220b3e5779 | Baseline |
| v2 | C:\Users\acer\Downloads\suraksha-chain\uploads\63ef3797-2996-40e2-9aba-985134c58440_TC1_VERSION_CHAIN.txt | 4fc9d7cc4138a2f634ff2d72da278350a78ab3078b694a4eb484f1e0653fd4c0 | Minor wording change; expected no drift |
| v3 | C:\Users\acer\Downloads\suraksha-chain\uploads\a9657c21-1d9d-4436-a7a9-5a10f7e2e8a2_TC1_VERSION_CHAIN.txt | fcccc739bd9fba85ab9620bbb39f43c03c520a204bf66b4ab7e80c716fecefd5 | Meaningful change; expected drift flag |

## Victim Record

Database record linked to case f4bbf83d-0986-4926-99f1-3fb63525b098:
victim_name: Test Victim
address: 123 Test Lane, Test District
contact_number: +91-90000-00000

## Role Hierarchy Walk-through

| Role | Buttons/pages expected | Direct requests blocked |
|---|---|---|
| IO | Case Dossier, Document Upload, Version Drift Check, Physical File Integrity, Judicial Authorization Workflow, Sec 228A IPC Victim Record | Upload/version without WRITE; audit log and Officer Directory; court-order attach/approve. |
| Forensic Expert | Case Dossier, Document Upload, Version Drift Check, Physical File Integrity, Judicial Authorization Workflow, Sec 228A IPC Victim Record | Upload/version without WRITE; court-order attach/approve; audit log and Officer Directory; victim-record POST. |
| Prosecutor | Case Dossier, Version Drift Check, Physical File Integrity, Judicial Authorization Workflow, Sec 228A IPC Victim Record | Document upload/version; court-order attach/approve; audit log and Officer Directory; victim-record POST. |
| Court Officer | All pages except Officer Directory, including Tamper-Evident Audit Ledger | Officer Directory; only Admin can manage users. |
| Admin | All pages, including Officer Directory | Production tamper simulation remains blocked unless ENABLE_TAMPER_TESTS=true. |

Hidden buttons are not the security boundary. Test copied API requests and record HTTP status. The server enforces case assignment, WRITE access, SEALED access, court-only order actions, audit role access, and victim-record permissions.

## Where to Test in the App

After login, select the TC1 case in Case Dossier.
- View a document hash: Case Dossier -> Current SHA-256 Digest, or Version Drift Check -> version details.
- Trigger integrity verification: Case Dossier -> document Actions -> Verify Integrity, or Physical File Integrity.
- View the audit log: Tamper-Evident Audit Ledger (Court Officer/Admin only).
- Submit/approve unseal: Judicial Authorization Workflow. Requesting user submits; Court Officer/Admin attaches and approves.
- View a victim record: Sec 228A IPC Victim Record.

## Important Test Order

1. Verify the original tamper hash and record PASS before editing the physical file.
2. Edit exactly one character outside the app and verify again for FAIL.
3. Compare v1->v2, then v2->v3.
4. Test sealed denial, then submit and approve an order, then test access again.
5. Check victim redaction with all five roles.
6. Check the audit ledger and verify its hash chain as Court Officer/Admin.
