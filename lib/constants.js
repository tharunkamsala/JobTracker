export const STATUS_OPTIONS = [
  "Bookmarked", "Applied", "Recruiter Screen", "Phone Screen",
  "Online Assessment", "Interview", "1st Round", "2nd Round",
  "Final Round", "Offer", "Offer Accepted", "Rejected",
  "Ghosted", "Dropped", "Withdrawn", "No Response",
];

export const STATUS_COLORS = {
  "Bookmarked":       { bg: "#E8EAF6", text: "#3F51B5", dot: "#3F51B5" },
  "Applied":          { bg: "#FFF8E1", text: "#F9A825", dot: "#F9A825" },
  "Recruiter Screen": { bg: "#FFF3E0", text: "#EF6C00", dot: "#EF6C00" },
  "Phone Screen":     { bg: "#FFF3E0", text: "#EF6C00", dot: "#EF6C00" },
  "Online Assessment":{ bg: "#FFF3E0", text: "#E65100", dot: "#E65100" },
  "Interview":        { bg: "#E8F5E9", text: "#2E7D32", dot: "#2E7D32" },
  "1st Round":        { bg: "#E8F5E9", text: "#388E3C", dot: "#388E3C" },
  "2nd Round":        { bg: "#E0F2F1", text: "#00796B", dot: "#00796B" },
  "Final Round":      { bg: "#E0F2F1", text: "#004D40", dot: "#004D40" },
  "Offer":            { bg: "#E8F5E9", text: "#1B5E20", dot: "#1B5E20" },
  "Offer Accepted":   { bg: "#C8E6C9", text: "#1B5E20", dot: "#1B5E20" },
  "Rejected":         { bg: "#FFEBEE", text: "#C62828", dot: "#C62828" },
  "Ghosted":          { bg: "#FFEBEE", text: "#E53935", dot: "#E53935" },
  "Dropped":          { bg: "#FFEBEE", text: "#EF5350", dot: "#EF5350" },
  "Withdrawn":        { bg: "#EFEBE9", text: "#795548", dot: "#795548" },
  "No Response":      { bg: "#F5F5F5", text: "#757575", dot: "#9E9E9E" },
};

/** Where this listing sits in your search (tabs + filters). */
export const JOB_BUCKETS = [
  "General",
  "Spring",
  "Summer",
  "Fall",
  "New Grad",
  "SDE I",
  "SDE II",
];

export const PRIORITY_COLORS = {
  "High":   { bg: "#FFEBEE", text: "#C62828" },
  "Medium": { bg: "#FFF8E1", text: "#EF6C00" },
  "Low":    { bg: "#E8F5E9", text: "#2E7D32" },
};
