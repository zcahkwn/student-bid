[![Netlify Status](https://api.netlify.com/api/v1/badges/68f46a21-7e83-4e7a-a158-e4d3fddb4893/deploy-status)](https://app.netlify.com/projects/student-bid/deploys)

Install dependencies and start local server:
```
npm install
npm run dev
```

Store Supabase RPC function definitions, schemas, table structures, and roles as .sql files.
```
supabase db dump > supabase/migrations/manual_dump.sql
```

Build the site and zip the build folder
```
npm run build-and-zip
```

