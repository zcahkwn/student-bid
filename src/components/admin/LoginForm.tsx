
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { getUserProfile } from "@/lib/userService";

interface AdminLoginProps {
  onLogin: (isAdmin: boolean, userId?: string) => void;
}

const AdminLoginForm = ({ onLogin }: AdminLoginProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLogin();
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      // First try Supabase authentication
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        // If Supabase auth fails, check for hardcoded super admin
        if (email === "admin" && password === "admin123") {
          toast({
            title: "Login successful",
            description: "Welcome, Super Admin (legacy mode)",
          });
          onLogin(true, "legacy-admin");
          return;
        }
        
        throw authError;
      }

      if (!authData.user) {
        throw new Error('No user data returned from authentication');
      }

      // Get user profile to check role
      const userProfile = await getUserProfile(authData.user.id);
      
      if (!userProfile) {
        await supabase.auth.signOut();
        throw new Error('User profile not found');
      }

      // Check if user has admin privileges
      if (userProfile.role === 'admin' || userProfile.role === 'super_admin') {
        toast({
          title: "Login successful",
          description: `Welcome, ${userProfile.name}`,
        });
        onLogin(true, authData.user.id);
      } else {
        // Sign out non-admin users
        await supabase.auth.signOut();
        toast({
          title: "Login failed",
          description: "You don't have admin privileges",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
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
          <div className="text-xs text-muted-foreground">
            <p>Legacy access: email "admin" with password "admin123"</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default AdminLoginForm;
