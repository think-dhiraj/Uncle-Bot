import WebSocket from 'ws';
import { GoogleAuth } from 'google-auth-library';

export interface LiveAPIConfig {
  projectId: string;
  location?: string;
  modelName?: string;
}

export interface LiveAPIMessage {
  type: 'audio' | 'text' | 'function_call' | 'function_response';
  data: any;
}

export class GeminiLiveAPIClient {
  private ws: WebSocket | null = null;
  private auth: GoogleAuth;
  private config: Required<LiveAPIConfig>;

  constructor(config: LiveAPIConfig) {
    this.config = {
      location: 'us-central1',
      modelName: 'gemini-2.0-flash-exp',
      ...config,
    };
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  /**
   * Connect to Gemini Live API for voice conversations
   */
  async connect(): Promise<void> {
    try {
      const accessToken = await this.auth.getAccessToken();
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?access_token=${accessToken}`;

      this.ws = new WebSocket(wsUrl);

      return new Promise((resolve, reject) => {
        if (!this.ws) return reject(new Error('WebSocket not initialized'));

        this.ws.on('open', () => {
          console.log('Connected to Gemini Live API');
          this.sendSetupMessage();
          resolve();
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('Disconnected from Gemini Live API');
        });
      });
    } catch (error) {
      throw new Error(`Failed to connect to Live API: ${error}`);
    }
  }

  /**
   * Send audio data to the Live API
   */
  sendAudio(audioData: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'audio/pcm',
            data: audioData.toString('base64'),
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send text message to the Live API
   */
  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'text/plain',
            data: Buffer.from(text).toString('base64'),
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Listen for messages from the Live API
   */
  onMessage(callback: (message: LiveAPIMessage) => void): void {
    if (!this.ws) {
      throw new Error('WebSocket not initialized');
    }

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        
        if (parsed.serverContent) {
          const content = parsed.serverContent;
          
          if (content.modelTurn) {
            // Handle model response
            const parts = content.modelTurn.parts || [];
            
            for (const part of parts) {
              if (part.text) {
                callback({
                  type: 'text',
                  data: part.text,
                });
              }
              
              if (part.inlineData && part.inlineData.mimeType === 'audio/pcm') {
                callback({
                  type: 'audio',
                  data: Buffer.from(part.inlineData.data, 'base64'),
                });
              }
              
              if (part.functionCall) {
                callback({
                  type: 'function_call',
                  data: part.functionCall,
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Error parsing Live API message:', error);
      }
    });
  }

  /**
   * Send function response back to the model
   */
  sendFunctionResponse(name: string, response: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: 'application/json',
            data: Buffer.from(JSON.stringify({
              functionResponse: {
                name,
                response,
              },
            })).toString('base64'),
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Configure voice settings
   */
  configureVoice(voiceConfig: {
    voiceName?: string;
    languageCode?: string;
    speakingRate?: number;
    pitch?: number;
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      setup: {
        model: `models/${this.config.modelName}`,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: voiceConfig,
          },
        },
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Close the connection
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private sendSetupMessage(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const setupMessage = {
      setup: {
        model: `models/${this.config.modelName}`,
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Puck',
              },
            },
          },
        },
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
  }
}
