# KLH University — Campus Lost & Found Portal

A warm, university-ready **Campus Lost & Found** platform tailored for **KLH University**, designed with a clean, student-friendly experience on the surface and a complete **CO1–CO6** distributed backend architecture underneath.

## Core Capabilities

- **Lost & Found Campus Board**: Browse items reported across exact KLH classrooms (`003–007`, `101–107`, `201–206`, `302–307`, `401–407`), labs (`008`, `108`, `301`, `303`, `Lab 01`, `Lab 14`, `Lab 15`), the **Canteen**, **SAC Room**, **Boys Common Room**, **Girls Common Room**, and **Indoor Sports Room** with an interactive **Rooms & Floors Directory**.
- **Python Semantic Description Matcher**: Automatically pairs lost reports with found items even when students use everyday synonyms (for example, matching *"navy Milton water flask near food court"* with *"dark blue steel sipper bottle at Canteen Helpdesk"*).
- **Ownership Claims & Desk Verification**: Students submit ownership proof against a verification prompt; KLH Campus Helpdesk staff compare it against private finder notes and issue a **KLH Pickup Pass Code** (`KLH-XXXX`) inside an ACID database transaction.
- **Live Campus Alerts**: Asynchronous event-driven notifications keep students updated from submission through desk pickup and reunion.

## Quick Demo Accounts

Use the **KLH Sign In / Account Switcher** in the top-right corner of the portal to switch roles in one click:

- **Santhosh Pendyala** (`2520030330` / `klhstudent`) — CSE Student
- **Ganesh Guntu** (`2520030252` / `klhstudent`) — CSE Student
- **Pranav Chowdary** (`2520030555` / `klhstudent`) — CSE Student
- **Jayanth Sunkara** (`2520030421` / `klhstudent`) — CSE Student
- **Srinivas Rao** (`STAFF-LF01` / `klhstaff`) — Campus Helpdesk Coordinator (unlocks **Helpdesk Queue**)

## Project Structure

- `frontend/` — React + Vite + Tailwind CSS portal for KLH University
- `services/catalog-matching-fastapi/` — Async FastAPI core API, 3NF SQL queries (JOINs, CTEs, Window Functions, ACID Transactions), MongoDB-compatible flexible document store, JWT auth, and Python 128-d semantic matcher
- `services/claims-express-service/` — Node.js/Express notifications, campus feed & pickup pass microservice
- `services/verification-springboot-service/` — Java Spring Boot roll-number & desk verification microservice
- `self-learning/` — Reference explorations in Flask, Django, and .NET Core
- `database/postgres_schema_pgvector.sql` — PostgreSQL + `pgvector` schema & analytical view
- `docs/C4_ARCHITECTURE_AND_CO_GUIDE.md` — C4 Architecture diagrams & CO1–CO6 rubric guide
- `docker-compose.yml` & `.github/workflows/ci-cd.yml` — Container orchestration & CI/CD pipeline
