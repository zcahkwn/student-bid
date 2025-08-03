
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { getAdminProfile } from "@/lib/adminService";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

interface AdminLoginProps {
  onLogin: (isAdmin: boolean, userId?: string) => void;
}

const AdminLoginForm = ({ onLogin }: AdminLoginProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Step 1: Authenticate with Supabase Auth
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      if (!data.user) {
        throw new Error("Authentication failed: No user data.");
      }

      // Step 2: Check if the authenticated user has an admin profile
      const adminProfile = await getAdminProfile(data.user.id);

      if (adminProfile) {
        toast({
          title: "Login successful",
          description: `Welcome, ${adminProfile.name} (${adminProfile.admin_type})`,
        });
        onLogin(true, data.user.id);
      } else {
        // If no admin profile, sign out the user from auth.users
        await supabase.auth.signOut();
        toast({
          title: "Login failed",
          description: "You are not authorized as an administrator.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-heading">Admin Login</CardTitle>
        <CardDescription>
          Sign in to manage classes and rewards
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </Button>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Need an admin account?{" "}
              <Link 
                to="/admin-register" 
                className="text-academy-blue hover:underline font-medium"
              >
                Register here
              </Link>
            </p>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
};

export default AdminLoginForm;
