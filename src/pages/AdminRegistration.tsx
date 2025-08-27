import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Loader2, UserPlus, ArrowLeft, Shield } from "lucide-react";

const AdminRegistration = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Frontend validation
    if (!username || !password || !confirmPassword) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
      toast({
        title: "Invalid username",
        description: "Username must be 3-50 characters and contain only letters, numbers, and underscores",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Call the register-admin edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          username,
          password
        })
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Registration successful",
          description: `Admin account "${username}" has been created successfully`,
        });
        
        // Redirect to login page after successful registration
        setTimeout(() => {
          navigate("/");
        }, 2000);
      } else {
        toast({
          title: "Registration failed",
          description: result.error || "Failed to create admin account",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: "Registration failed",
        description: "An error occurred during registration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-academy-blue rounded-full flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-heading font-bold text-academy-blue mb-2">
              Admin Registration
            </h1>
            <p className="text-muted-foreground">
              Create a new admin account for the Token Bidding Platform
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-heading flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Create Admin Account
              </CardTitle>
              <CardDescription>
                Choose a username and secure password for your admin account
              </CardDescription>
            </CardHeader>
            
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Security Notice:</strong> Admin accounts have full access to all classes and student data. 
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter admin username"
                    required
                    disabled={isLoading}
                    pattern="[a-zA-Z0-9_]{3,50}"
                    title="Username must be 3-50 characters and contain only letters, numbers, and underscores"
                  />
                  <p className="text-xs text-muted-foreground">
                    3-50 characters, letters, numbers, and underscores only
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter secure password"
                    required
                    disabled={isLoading}
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum 8 characters required
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    required
                    disabled={isLoading}
                    minLength={8}
                  />
                </div>

                {password && confirmPassword && password !== confirmPassword && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Passwords do not match
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
              
              <CardFooter className="flex flex-col space-y-3">
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading || password !== confirmPassword}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create Admin Account
                    </>
                  )}
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => navigate("/")}
                  disabled={isLoading}
                  className="w-full"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Login
                </Button>
              </CardFooter>
            </form>
          </Card>

          <div className="text-center mt-6">
            <p className="text-sm text-muted-foreground">
              Already have an admin account?{" "}
              <button 
                onClick={() => navigate("/")}
                className="text-academy-blue hover:underline font-medium"
                disabled={isLoading}
              >
                Sign in here
              </button>
            </p>
          </div>
        </div>
      </div>
      
      <footer className="border-t bg-white py-4 text-center text-sm text-muted-foreground">
        <div className="container mx-auto">
          Token Bidding Platform - Admin Registration
        </div>
      </footer>
    </div>
  );
};

export default AdminRegistration;