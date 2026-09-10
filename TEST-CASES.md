# TC1 Role-Wise Verification

The Render startup fixture creates exactly one physical evidence file for this case. It is created by the application initializer with `ENABLE_TC1_DATASET=true` and is not tampered with or pre-flagged.

- Case FIR: `TC1-ROLE-WISE-VERIFICATION`
- Case title: `TC1`
- Category: `SENSITIVE_WOMEN_SAFETY`
- IO: `io@suraksha.gov.in` with WRITE access
- Forensic Expert: `forensic@suraksha.gov.in` with WRITE access for forensic report versions
- Prosecutor: `prosecutor@suraksha.gov.in` with READ access
- Court Officer and Admin: normal elevated role access

## Physical File

Filename: `TC1_TAMPER_TEST.txt`

Exact original content, with no trailing newline:

```text
DNA Match Probability: 0.02%. Conclusion: Sample excluded from match.
```

Local verification path used for the real API test:

`C:\Users\acer\Downloads\suraksha-chain\.role-test-data\uploads\dc4c67b8-0002-4aff-833c-0891dae35160_TC1_TAMPER_TEST.txt`

Local SHA-256 baseline:

`4fb462f11d5dc6514d52de2d10c1a492215f9137884675527ff11b0aa46684ef`

On Render, the physical path will be under the persistent disk:

`/var/data/uploads/<generated-version-id>_TC1_TAMPER_TEST.txt`

The Render startup log prints the generated case ID and uploads directory. The stored hash is the baseline to compare after manual editing.

## Required Role Table

| Role | Should be ALLOWED to | Should be BLOCKED from |
|---|---|---|
| IO | Upload/view TC1 documents | Approving unseal requests |
| FORENSIC_EXPERT | View TC1, upload forensic report versions | Seeing unredacted victim record |
| PROSECUTOR | View TC1 documents (read-only) | Uploading new documents |
| COURT_OFFICER | Approve/reject unseal requests, see unredacted victim record | Uploading investigation documents |
| ADMIN | Everything above | Unauthenticated access must still be blocked |

## Real API Results

These results were obtained against a clean local Express server using the real login and API routes, with the automatic TC1 initializer enabled. HTTP status values are from the actual requests.

| Role/action | Observed result | Expected result | Status |
|---|---|---|---|
| IO views TC1 documents | Document list returned | Allowed | `200` |
| IO attempts unseal approval | Server denied route by role middleware | Blocked | `403` |
| FORENSIC_EXPERT uploads a forensic report version | Version upload accepted | Allowed | `200` |
| FORENSIC_EXPERT views victim record | `redacted: true`; victim name masked | Blocked from unredacted data | PASS |
| PROSECUTOR views TC1 documents | Document list returned | Allowed | `200` |
| PROSECUTOR uploads a new document version | Server denied WRITE operation | Blocked | `403` |
| COURT_OFFICER uploads an investigation document version | Server denied because no case WRITE assignment | Blocked | `403` |
| COURT_OFFICER views victim record | `redacted: false` | Allowed unredacted access | PASS |
| ADMIN views the audit ledger | Audit log returned | Allowed | `200` |
| No authentication requests the cases route | Server rejected request | Blocked | `401` |

The real local test identifiers were:

- Case ID: `4c33b7a7-3aa3-4b1e-99b2-9a9a6235467f`
- Document ID: `e547749b-847e-4670-ad3a-599722c8a76a`

The Render deployment will have different generated IDs, but the same routes and role rules.

## Manual Tamper Test

1. Log in as IO, Forensic Expert, Prosecutor, Court Officer, or Admin.
2. Open **Case Dossier** and select `TC1`.
3. Open **Physical File Integrity** or choose the document's **Verify Integrity** action.
4. First record the original stored hash and confirm the unmodified file passes.
5. Open the physical file directly and change exactly one character, for example `0.02%` to `0.03%`.
6. Save the file outside the application.
7. Run Verify Integrity again.

Expected result: the stored SHA-256 remains `4fb462f11d5dc6514d52de2d10c1a492215f9137884675527ff11b0aa46684ef`, the actual hash differs, and integrity reports FAIL/tamper detected. This fixture leaves the file untouched until you perform this manual edit.

## App Page and URL

The application uses a single-page interface. After deployment, open the Render service URL, log in, select **Case Dossier**, and select TC1.

Integrity page: the **Physical File Integrity** navigation page, or the document's **Verify Integrity** action in Case Dossier.

The API endpoint used by that page is:

`GET https://YOUR-RENDER-SERVICE.onrender.com/api/documents/<DOCUMENT_ID>/verify-file`

The document hash is also shown in **Case Dossier** under **Current SHA-256 Digest**.

## Render Deployment

The fixture is enabled in the Docker image and Render blueprint with `ENABLE_TC1_DATASET=true`. Deploy commit `02978a8` or a later commit. On first startup, the application creates the database record and one physical upload on the persistent `/var/data` disk. On later restarts, it detects the existing FIR and does not duplicate the case or file.
