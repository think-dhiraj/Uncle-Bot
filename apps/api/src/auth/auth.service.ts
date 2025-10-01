import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { KmsService } from '../kms/kms.service';
import { User } from 'db';

export interface GoogleProfile {
  id: string;
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private databaseService: DatabaseService,
    private kmsService: KmsService,
  ) {}

  async validateGoogleUser(profile: GoogleProfile): Promise<User> {
    let user = await this.databaseService.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      // Create new user
      user = await this.databaseService.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          image: profile.picture,
        },
      });
    } else {
      // Update user info
      user = await this.databaseService.user.update({
        where: { id: user.id },
        data: {
          name: profile.name,
          image: profile.picture,
        },
      });
    }

    // Store or update OAuth tokens
    await this.storeOAuthTokens(user.id, profile);

    return user;
  }

  private async storeOAuthTokens(userId: string, profile: GoogleProfile) {
    const encryptedAccessToken = await this.kmsService.encrypt(profile.accessToken);
    const encryptedRefreshToken = profile.refreshToken
      ? await this.kmsService.encrypt(profile.refreshToken)
      : null;

    await this.databaseService.oAuthToken.upsert({
      where: {
        userId_provider: {
          userId,
          provider: 'google',
        },
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: profile.expiresAt,
        scope: profile.scope,
      },
      create: {
        userId,
        provider: 'google',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: profile.expiresAt,
        scope: profile.scope,
      },
    });
  }

  async getDecryptedTokens(userId: string, provider: string = 'google') {
    const token = await this.databaseService.oAuthToken.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!token) {
      throw new UnauthorizedException('OAuth tokens not found');
    }

    const accessToken = await this.kmsService.decrypt(token.accessToken);
    const refreshToken = token.refreshToken
      ? await this.kmsService.decrypt(token.refreshToken)
      : null;

    return {
      accessToken,
      refreshToken,
      expiresAt: token.expiresAt,
      scope: token.scope,
    };
  }

  generateJwtToken(user: User): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };

    return this.jwtService.sign(payload);
  }

  async validateJwtPayload(payload: any): Promise<User> {
    const user = await this.databaseService.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    return user;
  }

  async refreshGoogleTokens(userId: string): Promise<void> {
    const tokens = await this.getDecryptedTokens(userId);
    
    if (!tokens.refreshToken) {
      throw new UnauthorizedException('No refresh token available');
    }

    // TODO: Implement token refresh logic using Google OAuth2 client
    // This would typically involve making a request to Google's token endpoint
    // with the refresh token to get new access and refresh tokens
  }

  async revokeTokens(userId: string): Promise<void> {
    await this.databaseService.oAuthToken.deleteMany({
      where: { userId },
    });
  }
}
