export interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

interface UsageBase {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

export interface DailyEntry extends UsageBase {
  date: string;
}

export interface DailyReport {
  daily: DailyEntry[];
}

export interface SessionEntry extends UsageBase {
  sessionId: string;
  projectPath: string;
  lastActivity: string;
}

export interface SessionReport {
  sessions: SessionEntry[];
}

export interface BlockTokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface BlockEntry {
  id: string;
  startTime: string;
  endTime: string;
  actualEndTime: string | null;
  isActive: boolean;
  isGap: boolean;
  entries: number;
  totalTokens: number;
  costUSD: number;
  models: string[];
  tokenCounts: BlockTokenCounts;
  burnRate: unknown | null;
  projection: unknown | null;
}

export interface BlocksReport {
  blocks: BlockEntry[];
}

export interface InstanceEntry extends DailyEntry {
  project: string;
}

export interface InstancesReport {
  projects: Record<string, InstanceEntry[]>;
}
