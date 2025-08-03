@@ .. @@
 ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
 
 -- RLS Policy for admins table:
--- Allow authenticated users to insert their own admin profile (only 'admin' type)
-CREATE POLICY "Allow authenticated users to register as admin"
-ON public.admins FOR INSERT
-WITH CHECK (auth.uid() = user_id AND admin_type = 'admin');
+-- Allow authenticated users to insert their own admin profile (only 'admin' type)
+CREATE POLICY "Allow authenticated users to register as admin"
+ON public.admins FOR INSERT
+TO authenticated
+WITH CHECK (auth.uid() = user_id AND admin_type = 'admin');
 
 -- Allow admins to view their own profile