import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassConfig } from "@/types";

interface RewardConfigProps {
  currentClass: ClassConfig | null;
  onUpdate: (updatedConfig: Partial<ClassConfig>) => void;
}

const RewardConfig = ({ currentClass, onUpdate }: RewardConfigProps) => {
  const [rewardTitle, setRewardTitle] = useState(currentClass?.rewardTitle || "Dinner with Professor");
  const [rewardDescription, setRewardDescription] = useState(
    currentClass?.rewardDescription || 
    "Join the professor for dinner and discussion at a local restaurant."
  );
  const [capacity, setCapacity] = useState(currentClass?.capacity || 7);

  useEffect(() => {
    if (currentClass) {
      setRewardTitle(currentClass.rewardTitle);
      setRewardDescription(currentClass.rewardDescription);
      setCapacity(currentClass.capacity);
    }
  }, [currentClass]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      rewardTitle,
      rewardDescription,
      capacity
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-heading">Configure Reward</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rewardTitle">Reward Title</Label>
            <Input
              id="rewardTitle"
              value={rewardTitle}
              onChange={(e) => setRewardTitle(e.target.value)}
              placeholder="e.g., Dinner with Professor"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="rewardDescription">Reward Description</Label>
            <Textarea
              id="rewardDescription"
              value={rewardDescription}
              onChange={(e) => setRewardDescription(e.target.value)}
              placeholder="Describe the reward in detail"
              rows={3}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="capacity">Default Capacity</Label>
            <div className="flex items-center gap-2">
              <Input
                id="capacity"
                type="number"
                min={1}
                max={100}
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
                required
              />
              <span className="text-sm text-muted-foreground">students</span>
            </div>
            <p className="text-xs text-muted-foreground">
              This is the default number of students that can be selected for each opportunity
            </p>
          </div>
          
          <Button type="submit" className="w-full">Save Configuration</Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default RewardConfig;