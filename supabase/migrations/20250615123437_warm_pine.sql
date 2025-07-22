/*
  # Dynamic bidding Tables System

  1. New Tables
    - `bidding_tables`: Store metadata about dynamically created bidding tables
    - Dynamic tables: `{class_name}_bidding` created per class
    
  2. Functions
    - `create_class_bidding_table()`: Creates a new bidding table for a class
    - `drop_class_bidding_table()`: Safely removes a class bidding table
    - `log_bidding_table_action()`: Audit logging for bidding table operations
    
  3. Security
    - Enable RLS on bidding_tables
    - Add policies for admin access
    - Audit logging for all operations
*/

-- Create bidding_tables metadata table
CREATE TABLE IF NOT EXISTS bidding_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE,
  table_name text NOT NULL UNIQUE,
  class_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  is_active boolean DEFAULT true
);

-- Create audit log table for bidding table operations
CREATE TABLE IF NOT EXISTS bidding_table_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('CREATE', 'DROP', 'INSERT', 'UPDATE', 'DELETE')),
  details jsonb,
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE bidding_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidding_table_audit ENABLE ROW LEVEL SECURITY;

-- Create policies for bidding_tables
CREATE POLICY "Admins can manage bidding tables"
  ON bidding_tables
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Create policies for audit log
CREATE POLICY "Admins can view audit logs"
  ON bidding_table_audit
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Function to sanitize class name for table naming
CREATE OR REPLACE FUNCTION sanitize_table_name(input_name text)
RETURNS text AS $$
BEGIN
  -- Convert to lowercase, replace spaces and special chars with underscores
  -- Remove any characters that aren't alphanumeric or underscore
  RETURN regexp_replace(
    regexp_replace(
      lower(trim(input_name)), 
      '[^a-z0-9_]', '_', 'g'
    ), 
    '_+', '_', 'g'
  );
END;
$$ LANGUAGE plpgsql;

-- Function to create a bidding table for a class
CREATE OR REPLACE FUNCTION create_class_bidding_table(
  p_class_id uuid,
  p_class_name text
)
RETURNS text AS $$
DECLARE
  table_name text;
  sql_statement text;
BEGIN
  -- Sanitize the class name for use as table name
  table_name := sanitize_table_name(p_class_name) || '_biddings';
  
  -- Check if table already exists
  IF EXISTS (
    SELECT 1 FROM bidding_tables 
    WHERE class_id = p_class_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Bidding table already exists for this class';
  END IF;
  
  -- Create the dynamic table
  sql_statement := format('
    CREATE TABLE IF NOT EXISTS %I (
      bidding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      host_name text NOT NULL,
      location text NOT NULL,
      max_guests integer NOT NULL DEFAULT 7,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      created_by uuid REFERENCES auth.users(id),
      is_active boolean DEFAULT true
    )', table_name);
  
  EXECUTE sql_statement;
  
  -- Enable RLS on the new table
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  
  -- Create policy for the new table
  EXECUTE format('
    CREATE POLICY "Admins can manage %I"
      ON %I
      FOR ALL
      TO authenticated
      USING (auth.uid() IS NOT NULL)
  ', table_name, table_name);
  
  -- Create indexes
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_host_name ON %I(host_name)', table_name, table_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_location ON %I(location)', table_name, table_name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_created_at ON %I(created_at)', table_name, table_name);
  
  -- Create updated_at trigger
  EXECUTE format('
    CREATE TRIGGER update_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column()
  ', table_name, table_name);
  
  -- Record in metadata table
  INSERT INTO bidding_tables (class_id, table_name, class_name, created_by)
  VALUES (p_class_id, table_name, p_class_name, auth.uid());
  
  -- Log the action
  INSERT INTO bidding_table_audit (table_name, action, details, performed_by)
  VALUES (table_name, 'CREATE', jsonb_build_object(
    'class_id', p_class_id,
    'class_name', p_class_name
  ), auth.uid());
  
  RETURN table_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely drop a class bidding table
CREATE OR REPLACE FUNCTION drop_class_bidding_table(p_class_id uuid)
RETURNS boolean AS $$
DECLARE
  table_record record;
BEGIN
  -- Get the table info
  SELECT * INTO table_record 
  FROM bidding_tables 
  WHERE class_id = p_class_id AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active bidding table found for this class';
  END IF;
  
  -- Drop the table
  EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', table_record.table_name);
  
  -- Mark as inactive in metadata
  UPDATE bidding_tables 
  SET is_active = false 
  WHERE id = table_record.id;
  
  -- Log the action
  INSERT INTO bidding_table_audit (table_name, action, details, performed_by)
  VALUES (table_record.table_name, 'DROP', jsonb_build_object(
    'class_id', p_class_id,
    'class_name', table_record.class_name
  ), auth.uid());
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log bidding table operations
CREATE OR REPLACE FUNCTION log_bidding_table_action()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO bidding_table_audit (table_name, action, details, performed_by)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    CASE 
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END,
    auth.uid()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bidding_tables_class_id ON bidding_tables(class_id);
CREATE INDEX IF NOT EXISTS idx_bidding_tables_table_name ON bidding_tables(table_name);
CREATE INDEX IF NOT EXISTS idx_bidding_table_audit_table_name ON bidding_table_audit(table_name);
CREATE INDEX IF NOT EXISTS idx_bidding_table_audit_performed_at ON bidding_table_audit(performed_at);