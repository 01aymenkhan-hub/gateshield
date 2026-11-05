# Two independent installations: 1+1 versus 2+2 OCR workers

Deployed and tested on 2026-11-04, existing 6-vCPU / approximately 12-GB VPS.

| Installation | Public URL | Internal web | Own OCR | Database |
|---|---|---:|---:|---|
| Company 1 | https://gateshield.pro | 127.0.0.1:3000 | 127.0.0.1:8000 | gateshield |
| Company 2 | https://217.216.78.153:8443 | 127.0.0.1:3100 | 127.0.0.1:8100 | gateshield_company2 |

**Final running configuration: two independent OCR services, two workers each,
two CPU threads per worker.** Four images can actually undergo inference
simultaneously. Old Urdu CNIC names remain manual entry; number/core OCR is fast.

## Measured comparison

Both profiles used identical fixtures and request counts, after six separately
recorded warm-up scans. Each profile had 48 measured scans: 18 sequential, three
two-request batches, three four-request mixed batches, and three four-old-CNIC
batches. No image/result cache, cloud OCR or mocked inference was used.

| Measurement | 1 worker per OCR, 2 total | 2 workers per OCR, 4 total |
|---|---:|---:|
| Single-request median, both installations/types | 2.959 s | 2.850 s |
| One concurrent scan per installation: request median | 3.052 s | 3.252 s |
| Four mixed requests: median individual response | 4.835 s | 5.123 s |
| Four mixed requests: median time until all four finish | 6.550 s | 5.321 s |
| Four mixed requests: slowest observed completion | 6.692 s | 6.622 s |
| Four old-CNIC requests: median time until all four finish | 6.191 s | 6.432 s |
| Four-request mixed batches: maximum admission queue time | 3,847 ms | 0.48 ms |
| CPU average during four mixed scans, entire VPS | 64.12% | 94.35% |
| CPU peak during measured test, entire VPS | 73.11% | 100% |
| System RAM peak, entire measured workload | 3.971 GiB | 5.620 GiB |
| Minimum system available RAM | 7.709 GiB | 6.060 GiB |
| Company 1 OCR cgroup RAM peak during measurement | 1.491 GiB | 2.378 GiB |
| Company 2 OCR cgroup RAM peak during measurement | 1.451 GiB | 2.385 GiB |
| Failed measured scans | 0/48 | 0/48 |

CPU is normalized to **all six virtual CPUs**, not a per-core process percentage.
Memory uses Linux `MemTotal - MemAvailable`; filesystem page cache is not simply
counted as application demand. Per-service memory is sampled cgroup usage.
System resources were sampled every 0.2 seconds: 521 samples for 1+1 and 494 for
2+2. Peak CPU steal was zero in these samples. No swap was used/configured.
The new Next.js build was finished before either measured profile.

Two workers remove the queue for each installation's first two scans, but they
share the same finite physical CPU resources. This does **not** make every
request faster: first-wave requests can take longer when four models compete.
Mixed batch median completion improved by about 19%, while four-old-card batch
completion did not improve in these three repeats. RAM is comfortable; CPU is
the main limiting resource at four simultaneous scans.

The final configuration is suitable for testing four simultaneous scans, with
normal single scans around three seconds and four-scan bursts around five to
seven seconds on these fixtures. It does not establish a two-to-three-second
guarantee for every scan at concurrency four. Sustained four-scan work leaves
little CPU headroom; consistently lower peak latency requires more CPU capacity
or separating the OCR workloads across hosts.

## Single-scan medians in final 2+2 configuration

| Fixture, 3 repeats per installation | Company 1 | Company 2 |
|---|---:|---:|
| Smart CNIC | 3.343 s | 3.288 s |
| Newer driving licence | 2.925 s | 2.839 s |
| Old Urdu CNIC, names manual | 2.637 s | 2.657 s |

## Public HTTPS and actual parallel processing

After the controlled benchmark, four authenticated scans were sent through the
two real public frontends, two to each installation. Three repeats completed
in **4.921, 4.825 and 5.452 seconds** for the complete four-request batch.
All twelve responses had exact expected identifiers. All four inference
intervals overlapped, with **four distinct process IDs and two belonging to
each OCR service**. Minimum four-way overlap was 4.036 seconds.

The direct benchmark also proved the intended distinction: four-request batches
had at most two simultaneous inference intervals with 1+1 workers, and four
with 2+2. Both API health endpoints stayed responsive during the batches.

The second software's real mobile operator and desktop admin forms returned
the exact old-CNIC number, blank names, and editable manual name fields. Backend
processing measured 2.609 and 2.611 seconds in those browser checks. Neither
browser flow submitted a visitor record.

## Isolation and deployment checks

* Separate Linux service users, source/dependency directories, OCR processes,
  model caches, uploads, JWT secrets and private environment files.
* Separate database and database owner, on the existing PostgreSQL server.
  The new database has no PUBLIC connection grant. PostgreSQL checks confirmed
  that the primary role cannot connect to the new database, and the secondary
  role cannot read primary user tables. Neither Linux service user can read
  the other installation's secret environment file.
* Browser cookie prefixes differ (`gk` and `gk2`). Since ports alone do not
  isolate cookies, the second installation uses configurable cookie names.
  Both accounts stayed logged in simultaneously on the same IP across ports;
  logging out of company 2 left company 1 authenticated.
* The second app uses the existing valid IP TLS certificate on port 8443,
  renewed by the existing certificate timer. Both public URLs return HTTP 200;
  anonymous OCR is rejected. Web/OCR internal ports bind only to loopback.
* Company 2 check-in/check-out, vehicle lookup, persistent incoming/outgoing
  documents, authenticated image retrieval, parcel validation and delivery
  transitions passed **17 real workflow checks**. Synthetic records/files
  were removed afterwards. Email sending is disabled in the testing setup.
* The second app starts with its own admin/operator, one test gate and one
  test department. No primary accounts, visitors, visits or document photos
  were copied. Existing primary records remained four users, one person,
  one visit and zero parcels. Secondary records after cleanup are two users,
  zero people/visits/parcels, one gate and one department.
* A separate verified database/uploads backup and daily timer were installed
  for company 2, scheduled at **04:30 Asia/Karachi** with seven-day retention.
  The existing primary backup schedule remains in place.
* Both web and both OCR services are enabled/healthy. Final OCR configuration
  reports two workers per service; no automatic service restarts occurred.
* All 48 existing backend unit checks passed after the single-worker timing
  instrumentation; frontend TypeScript and the second production build passed.

## Evidence and limits

Private reports on VPS:
`/opt/gateshield/backups/20261104-two-installations/` contains `workers-1.json`,
`workers-2.json`, `public-four-scans.json`, `performance-summary.json`, workflow
evidence, setup configuration scripts and pre-change primary service config.
Actual identity images remained on the VPS during processing. Only aggregate
timing/resource data was retrieved for this report.

Second software files: `/opt/gateshield-company2/`; environment configuration:
`/etc/gateshield/company2-web.env` and `company2-ocr.env`. Credentials are supplied
separately in a private local login file, never embedded in this report or Git.

These are bounded three-repeat workload tests, not an endurance test or a
capacity SLA. The old-card evidence uses one real original plus the existing
fixture variations; exact identifier checks do not establish population-wide
OCR accuracy. The two installations still share the VPS CPU, disk, operating
system and PostgreSQL engine, so host failures and resource contention can
affect both.
