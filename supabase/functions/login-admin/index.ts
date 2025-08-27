import { createClient } from "npm:@supabase/supabase-js@2.39.0";

interface LoginRequest {
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
    const { username, password }: LoginRequest = await req.json();

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

    // Initialize Supabase client with service role key for admin operations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Retrieve admin user by username
    const { data: adminUser, error: fetchError } = await supabase
      .from("admin_users")
      .select("id, username, password_hash, created_at")
      .eq("username", username)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching admin user:", fetchError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Database error during login" 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!adminUser) {
      // Don't reveal whether username exists or not for security
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid username or password" 
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Hash the provided password using the same method as registration
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const providedPasswordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Compare password hashes
    if (providedPasswordHash !== adminUser.password_hash) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Invalid username or password" 
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Authentication successful - return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "Login successful",
        admin: {
          id: adminUser.id,
          username: adminUser.username,
          created_at: adminUser.created_at
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Unexpected error in login-admin function:", error);
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