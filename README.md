# Student bidding platform
[![Netlify Status](https://api.netlify.com/api/v1/badges/68f46a21-7e83-4e7a-a158-e4d3fddb4893/deploy-status)](https://app.netlify.com/projects/student-bid/deploys)
Live site: https://student-bid.netlify.app/

## Installation

1. Clone the repo:
```bash
git clone https://github.com/zcahkwn/student-bid
cd student-bid
```
2. Install dependenciees:
```bash
npm install
```

## Running Locally

Start development server:
```
npm run dev
```
The application will be accessible at http://localhost:8080.

---
## Supabase 
This project uses Supabase as its backend.

To update and store Supabase RPC function definitions, schemas, table structures, and roles as .sql files, run:
```
supabase db dump > supabase/past_migrations/manual_dump.sql
```
---
## Building and Deployment

To create a zip archive of the production build (e.g., for Netlify deployment):
```
npm run build-and-zip
```
This command first runs npm run build and then zips the contents of the dist folder into build.zip in the project root.

--- 
