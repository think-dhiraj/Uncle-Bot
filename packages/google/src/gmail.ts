import { gmail_v1, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GmailHistoryItem {
  id: string;
  messages?: gmail_v1.Schema$Message[];
  messagesAdded?: gmail_v1.Schema$HistoryMessageAdded[];
  messagesDeleted?: gmail_v1.Schema$HistoryMessageDeleted[];
  labelsAdded?: gmail_v1.Schema$HistoryLabelAdded[];
  labelsRemoved?: gmail_v1.Schema$HistoryLabelRemoved[];
}

export interface GmailThread {
  id: string;
  snippet: string;
  historyId: string;
  messages: gmail_v1.Schema$Message[];
}

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(private auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  /**
   * Set up Gmail push notifications
   * Cite: Gmail push notifications - https://developers.google.com/gmail/api/guides/push
   */
  async watch(topicName: string, labelIds?: string[]): Promise<{ historyId: string; expiration: string }> {
    const response = await this.gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName,
        labelIds: labelIds || ['INBOX'],
      },
    });

    return {
      historyId: response.data.historyId!,
      expiration: response.data.expiration!,
    };
  }

  /**
   * Get Gmail history since a specific history ID for incremental sync
   * Cite: Gmail history API - https://developers.google.com/gmail/api/reference/rest/v1/users.history/list
   */
  async historySince(historyId: string, maxResults: number = 100): Promise<GmailHistoryItem[]> {
    try {
      const response = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
        maxResults,
      });

      return response.data.history?.map(item => ({
        id: item.id!,
        messages: item.messages,
        messagesAdded: item.messagesAdded,
        messagesDeleted: item.messagesDeleted,
        labelsAdded: item.labelsAdded,
        labelsRemoved: item.labelsRemoved,
      })) || [];
    } catch (error: any) {
      // Handle 404 - history ID too old, need full resync
      if (error.code === 404) {
        throw new Error('HISTORY_ID_TOO_OLD');
      }
      throw error;
    }
  }

  /**
   * List email threads with optional query and pagination
   */
  async listThreads(options: {
    query?: string;
    labelIds?: string[];
    maxResults?: number;
    pageToken?: string;
  } = {}): Promise<{ threads: GmailThread[]; nextPageToken?: string }> {
    const { query, labelIds, maxResults = 50, pageToken } = options;

    const response = await this.gmail.users.threads.list({
      userId: 'me',
      q: query,
      labelIds,
      maxResults,
      pageToken,
    });

    const threads = await Promise.all(
      (response.data.threads || []).map(async (thread) => {
        const threadDetail = await this.gmail.users.threads.get({
          userId: 'me',
          id: thread.id!,
        });

        return {
          id: thread.id!,
          snippet: threadDetail.data.snippet || '',
          historyId: threadDetail.data.historyId!,
          messages: threadDetail.data.messages || [],
        };
      })
    );

    return {
      threads,
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Get a specific thread with all messages
   */
  async getThread(threadId: string): Promise<GmailThread> {
    const response = await this.gmail.users.threads.get({
      userId: 'me',
      id: threadId,
    });

    return {
      id: response.data.id!,
      snippet: response.data.snippet || '',
      historyId: response.data.historyId!,
      messages: response.data.messages || [],
    };
  }

  /**
   * Create a draft email
   */
  async createDraft(message: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    threadId?: string;
  }): Promise<{ id: string; message: gmail_v1.Schema$Message }> {
    const headers = [
      `To: ${message.to.join(', ')}`,
      ...(message.cc ? [`Cc: ${message.cc.join(', ')}`] : []),
      ...(message.bcc ? [`Bcc: ${message.bcc.join(', ')}`] : []),
      `Subject: ${message.subject}`,
      ...(message.threadId ? [`In-Reply-To: ${message.threadId}`] : []),
      'Content-Type: text/html; charset=utf-8',
      '',
      message.body,
    ].join('\r\n');

    const encodedMessage = Buffer.from(headers).toString('base64url');

    const response = await this.gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId: message.threadId,
        },
      },
    });

    return {
      id: response.data.id!,
      message: response.data.message!,
    };
  }

  /**
   * Send a draft email
   */
  async sendDraft(draftId: string): Promise<gmail_v1.Schema$Message> {
    const response = await this.gmail.users.drafts.send({
      userId: 'me',
      requestBody: {
        id: draftId,
      },
    });

    return response.data.message!;
  }

  /**
   * Send an email directly
   */
  async sendMessage(message: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    threadId?: string;
  }): Promise<gmail_v1.Schema$Message> {
    const headers = [
      `To: ${message.to.join(', ')}`,
      ...(message.cc ? [`Cc: ${message.cc.join(', ')}`] : []),
      ...(message.bcc ? [`Bcc: ${message.bcc.join(', ')}`] : []),
      `Subject: ${message.subject}`,
      ...(message.threadId ? [`In-Reply-To: ${message.threadId}`] : []),
      'Content-Type: text/html; charset=utf-8',
      '',
      message.body,
    ].join('\r\n');

    const encodedMessage = Buffer.from(headers).toString('base64url');

    const response = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: message.threadId,
      },
    });

    return response.data;
  }

  /**
   * Get current history ID for user
   */
  async getCurrentHistoryId(): Promise<string> {
    const response = await this.gmail.users.getProfile({
      userId: 'me',
    });

    return response.data.historyId!;
  }

  /**
   * Stop watching for push notifications
   */
  async stopWatch(): Promise<void> {
    await this.gmail.users.stop({
      userId: 'me',
    });
  }
}
