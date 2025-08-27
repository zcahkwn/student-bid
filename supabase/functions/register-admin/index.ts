import { createClient } from "npm:@supabase/supabase-js@2.39.0";

interface RegisterRequest {
  username: string;
  password: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { username, password }: RegisterRequest = await req.json();

    // Validate input
    if (!username || !password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Username and password are required" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate username format (alphanumeric, 3-50 characters)
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Username must be 3-50 characters and contain only letters, numbers, and underscores" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate password strength (minimum 8 characters)
    if (password.length < 8) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Password must be at least 8 characters long" 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client with service role key for admin operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Hash the password using Web Crypto API (built into Deno)
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const password_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Check if username already exists
    const { data: existingAdmin, error: checkError } = await supabase
      .from("admin_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing admin:", checkError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Database error during registration" 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (existingAdmin) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Username already exists" 
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert new admin user
    const { data: newAdmin, error: insertError } = await supabase
      .from("admin_users")
      .insert({
        username,
        password_hash
      })
      .select("id, username, created_at")
      .single();

    if (insertError) {
      console.error("Error creating admin user:", insertError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Failed to create admin account" 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success response (without sensitive data)
    return new Response(
      JSON.stringify({
        success: true,
        message: "Admin account created successfully",
        admin: {
          id: newAdmin.id,
          username: newAdmin.username,
          created_at: newAdmin.created_at
        }
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Unexpected error in register-admin function:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "Internal server error" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});