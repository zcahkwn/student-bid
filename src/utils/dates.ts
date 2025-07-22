import { BidOpportunity } from "@/types";

// Function to check if a bid opportunity is currently open
export const isBidOpportunityOpen = (opportunity: BidOpportunity): boolean => {
  const now = new Date();
  
  // Directly use the provided bidOpenDate and bidCloseDate without fallbacks
  if (!opportunity.bidOpenDate || !opportunity.bidCloseDate) {
    return false; // Not open if dates are not properly configured
  }
  
  const bidOpenDate = new Date(opportunity.bidOpenDate);
  const bidCloseDate = new Date(opportunity.bidCloseDate);
  
  // Check if dates are valid
  if (isNaN(bidOpenDate.getTime()) || isNaN(bidCloseDate.getTime())) {
    return false; // Not open if dates are invalid
  }
  
  // Bidding is open if current date is after bidding open date and before bidding close date
  return now >= bidOpenDate && now < bidCloseDate;
};

// Format a date for display
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    weekday: 'short'
  });
};

// Get readable status for a bid opportunity
export const getBidOpportunityStatus = (opportunity: BidOpportunity): string => {
  const now = new Date();
  const eventDate = new Date(opportunity.date);
  
  // Check if bidding dates are properly configured
  if (!opportunity.bidOpenDate || !opportunity.bidCloseDate) {
    return "Invalid Date Configuration";
  }
  
  const bidOpenDate = new Date(opportunity.bidOpenDate);
  const bidCloseDate = new Date(opportunity.bidCloseDate);
  
  // Check if dates are valid
  if (isNaN(bidOpenDate.getTime()) || isNaN(bidCloseDate.getTime()) || isNaN(eventDate.getTime())) {
    return "Invalid Date Configuration";
  }
  
  if (now > eventDate) {
    return "Completed";
  } else if (now >= bidOpenDate && now < bidCloseDate) {
    return "Open for Bidding";
  } else if (now >= bidCloseDate && now < eventDate) {
    return "Bidding Closed";
  } else {
    return "Coming Soon";
  }
};