import { Injectable } from '@nestjs/common';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class KmsService {
  private kmsClient: KeyManagementServiceClient | null = null;
  private keyName!: string;
  private isLocal: boolean;

  constructor(private configService: ConfigService) {
    this.isLocal = this.configService.get('NODE_ENV') === 'development';
    
    if (!this.isLocal) {
      this.kmsClient = new KeyManagementServiceClient();
      const projectId = this.configService.get('GOOGLE_CLOUD_PROJECT');
      const locationId = this.configService.get('KMS_LOCATION', 'global');
      const keyRingId = this.configService.get('KMS_KEY_RING');
      const keyId = this.configService.get('KMS_KEY_ID');
      
      this.keyName = this.kmsClient.cryptoKeyPath(
        projectId,
        locationId,
        keyRingId,
        keyId,
      );
    }
  }

  /**
   * Encrypt sensitive data (OAuth tokens)
   * In local development, use simple encryption for testing
   */
  async encrypt(plaintext: string): Promise<string> {
    if (this.isLocal) {
      // Mock encryption for local development
      const key = this.configService.get('LOCAL_ENCRYPTION_KEY', 'local-dev-key-32-chars-long!!!');
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', key);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return `${iv.toString('hex')}:${encrypted}`;
    }

    if (!this.kmsClient) {
      throw new Error('KMS client not initialized');
    }

    const [result] = await this.kmsClient.encrypt({
      name: this.keyName,
      plaintext: Buffer.from(plaintext),
    });

    return result.ciphertext?.toString() || '';
  }

  /**
   * Decrypt sensitive data (OAuth tokens)
   * In local development, use simple decryption for testing
   */
  async decrypt(ciphertext: string): Promise<string> {
    if (this.isLocal) {
      // Mock decryption for local development
      const key = this.configService.get('LOCAL_ENCRYPTION_KEY', 'local-dev-key-32-chars-long!!!');
      const [ivHex, encrypted] = ciphertext.split(':');
      const decipher = crypto.createDecipher('aes-256-cbc', key);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    if (!this.kmsClient) {
      throw new Error('KMS client not initialized');
    }

    const [result] = await this.kmsClient.decrypt({
      name: this.keyName,
      ciphertext: Buffer.from(ciphertext, 'base64'),
    });

    return result.plaintext?.toString() || '';
  }

  /**
   * Check if KMS is properly configured
   */
  isConfigured(): boolean {
    return this.isLocal || (this.kmsClient !== null && this.keyName !== undefined);
  }
}
