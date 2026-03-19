export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ConversationState {
  phone: string;
  messages: ConversationMessage[];
  lastActivity: Date;
  isAdmin: boolean;
}
