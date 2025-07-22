import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import RewardConfig from "@/components/admin/RewardConfig";
import { ClassConfig } from "@/types";
import { useToast } from "@/hooks/use-toast";

interface RewardsProps {
  currentClass: ClassConfig | null;
  onUpdateReward: (config: Partial<ClassConfig>) => void;
}

const Rewards = ({ currentClass, onUpdateReward }: RewardsProps) => {
  const { toast } = useToast();
  
  const handleUpdateReward = (config: Partial<ClassConfig>) => {
    onUpdateReward(config);
    
    toast({
      title: "Reward configuration updated",
      description: "The reward settings have been saved successfully",
    });
  };
  
  if (!currentClass) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-heading font-bold mb-6">Reward Configuration</h1>
        <p className="text-center text-muted-foreground py-8">
          Please select a class to configure rewards
        </p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-heading font-bold">
          Reward Configuration - {currentClass.className}
        </h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <RewardConfig 
          currentClass={currentClass}
          onUpdate={handleUpdateReward}
        />
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-heading">About Rewards</CardTitle>
            <CardDescription>
              How the reward system works
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Reward Configuration</h3>
              <p className="text-sm text-muted-foreground">
                The reward configuration determines what students will see when they log in and place bids.
                You can customize the title, description, and capacity for the reward.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Capacity</h3>
              <p className="text-sm text-muted-foreground">
                The capacity setting determines how many students can be selected for each bidding opportunity.
                If more students place bids than the capacity allows, a random selection will be performed.
              </p>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Bidding Process</h3>
              <p className="text-sm text-muted-foreground">
                Students use their token to place a bid for an opportunity. Once all bids are in,
                you can use the Selection tab to randomly select students if there are more bids than spots available.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Rewards;