/**
 * PIR Server TypeScript Definitions
 * TypeScript type definitions for PIR Server Client SDK
 */

// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'premium' | 'admin';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  login_attempts?: number;
}

// Authentication Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: 'user' | 'premium' | 'admin';
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
  expires_at: string;
  timestamp: string;
}

// Card Types
export interface Card {
  id: string;
  name: string;
  description?: string;
  value?: string | number;
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
  created_by?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface CreateCardRequest {
  name: string;
  description?: string;
  value?: number;
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface UpdateCardRequest {
  name?: string;
  description?: string;
  value?: number;
  properties?: Record<string, any>;
  metadata?: Record<string, any>;
  is_active?: boolean;
}

export interface CardsResponse {
  success: boolean;
  cards: Card[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  timestamp: string;
}

// PIR Query Types
export interface PIRQuery {
  type: 'card_lookup' | 'card_search' | 'card_stats' | 'card_validation';
  parameters: Record<string, any>;
  timestamp: number;
  nonce: string;
}

export interface CardLookupParameters {
  cardId: string;
  encryptedProperties?: string[];
}

export interface CardSearchParameters {
  searchCriteria: Record<string, any>;
  maxResults?: number;
  properties?: string[];
  privacyLevel?: 'basic' | 'extended' | 'full';
}

export interface CardStatsParameters {
  statType: 'card_count' | 'property_distribution' | 'usage_stats';
  filters?: Record<string, any>;
  privacyLevel?: 'aggregate' | 'detailed';
}

export interface CardValidationParameters {
  cardId: string;
  validationType?: 'existence' | 'detailed';
}

// PIR Response Types
export interface PIRResponse {
  success: boolean;
  result: any;
  timestamp: string;
}

export interface CardLookupResult {
  found: boolean;
  cardId: string;
  data?: Record<string, any>;
  message?: string;
  queryId: string;
  timestamp: string;
}

export interface CardSearchResult {
  results: Array<{
    id: string;
    data: Record<string, any>;
    relevance_score: number;
  }>;
  total_found: number;
  search_id: string;
  timestamp: string;
}

export interface CardStatsResult {
  total_count?: number;
  distribution?: Record<string, number>;
  privacy_level: string;
  timestamp: string;
}

export interface CardValidationResult {
  valid: boolean;
  card_id: string;
  validation_type: string;
  status?: string;
  created_at?: string;
  timestamp: string;
}

export interface BulkQueryResult {
  index: number;
  success: boolean;
  result?: any;
  error?: string;
  query?: string;
}

export interface BulkQueryResponse {
  success: boolean;
  results: BulkQueryResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  timestamp: string;
}

// Admin Types
export interface DashboardStats {
  users: {
    total: number;
    active: number;
    admins: number;
    premium: number;
  };
  cards: {
    total: number;
    active: number;
  };
  recent_activity: {
    new_users: number;
    new_cards: number;
  };
  system: {
    uptime: number;
    memory_usage: NodeJS.MemoryUsage;
    node_version: string;
    platform: string;
    arch: string;
  };
}

export interface UserUpdateRequest {
  email?: string;
  name?: string;
  role?: 'user' | 'premium' | 'admin';
  is_active?: boolean;
}

export interface UsersResponse {
  success: boolean;
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  timestamp: string;
}

export interface UserDetails extends User {
  statistics: {
    cards_created: number;
    queries_made: number;
  };
}

// System Types
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version?: string;
  uptime?: number;
}

export interface PIRHealthResponse {
  status: 'healthy' | 'unhealthy';
  checks: {
    database: boolean;
    encryption: boolean;
    pir_engine: boolean;
  };
  timestamp: string;
}

export interface DatabaseStats {
  connected: boolean;
  client: string;
  version?: string;
  tables: string[];
}

export interface PIRStats {
  database: DatabaseStats;
  cache: {
    hits: number;
    misses: number;
    entries: number;
    max_size: number;
    enabled: boolean;
  };
  queries: {
    total_queries_today: number;
    unique_users_today: number;
    average_response_time: number;
    cache_hit_rate: number;
  };
  system: {
    uptime: number;
    memory_usage: NodeJS.MemoryUsage;
    node_version: string;
  };
}

// Client Configuration
export interface PIRClientOptions {
  baseURL?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

// Error Types
export interface APIError {
  error: string;
  code: string;
  details?: any;
  timestamp: string;
}

export class PIRClientError extends Error {
  code: string;
  details?: any;
  
  constructor(message: string, code: string, details?: any) {
    super(message);
    this.name = 'PIRClientError';
    this.code = code;
    this.details = details;
  }
}

// Filter Types
export interface CardFilters {
  page?: number;
  limit?: number;
  search?: string;
  is_active?: boolean | 'all';
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  is_active?: boolean | 'all';
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface LogFilters {
  level?: 'error' | 'warn' | 'info' | 'debug';
  limit?: number;
  type?: string;
}

// Pagination Types
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

// Request/Response Wrapper Types
export interface APIResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  timestamp: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ValidationResponse {
  error: string;
  code: string;
  details: ValidationError[];
  timestamp: string;
}

// Client SDK Class
export declare class PIRClient {
  constructor(options?: PIRClientOptions);
  
  // Authentication Methods
  register(userData: RegisterRequest): Promise<APIResponse>;
  login(email: string, password: string): Promise<AuthResponse>;
  logout(): Promise<APIResponse>;
  getCurrentUser(): Promise<APIResponse<User>>;
  refreshToken(): Promise<AuthResponse>;
  changePassword(currentPassword: string, newPassword: string): Promise<APIResponse>;
  
  // PIR Query Methods
  lookupCard(cardId: string, encryptedProperties?: string[]): Promise<PIRResponse>;
  searchCards(searchCriteria: Record<string, any>, options?: Partial<CardSearchParameters>): Promise<PIRResponse>;
  getCardStats(statType: string, filters?: Record<string, any>): Promise<PIRResponse>;
  validateCard(cardId: string, validationType?: string): Promise<PIRResponse>;
  bulkQuery(queries: PIRQuery[]): Promise<BulkQueryResponse>;
  
  // Card Management Methods
  createCard(cardData: CreateCardRequest): Promise<APIResponse>;
  getCards(filters?: CardFilters): Promise<CardsResponse>;
  getCard(cardId: string): Promise<APIResponse<Card>>;
  updateCard(cardId: string, updates: UpdateCardRequest): Promise<APIResponse>;
  deleteCard(cardId: string, hardDelete?: boolean): Promise<APIResponse>;
  restoreCard(cardId: string): Promise<APIResponse>;
  
  // Admin Methods
  getDashboard(): Promise<APIResponse<DashboardStats>>;
  getUsers(filters?: UserFilters): Promise<UsersResponse>;
  getUser(userId: string): Promise<APIResponse<UserDetails>>;
  updateUser(userId: string, updates: UserUpdateRequest): Promise<APIResponse>;
  resetUserPassword(userId: string, newPassword: string): Promise<APIResponse>;
  
  // System Methods
  health(): Promise<HealthResponse>;
  pirHealth(): Promise<PIRHealthResponse>;
  getPIRStats(): Promise<PIRStats>;
  
  // Utility Methods
  isAuthenticated(): boolean;
  getCurrentUser(): User | null;
  generatePIRQuery(type: string, parameters?: Record<string, any>): PIRQuery;
  isValidPIRQuery(query: any): boolean;
  
  // Token Management
  setToken(token: string): void;
  clearToken(): void;
}

// Export default
export default PIRClient;