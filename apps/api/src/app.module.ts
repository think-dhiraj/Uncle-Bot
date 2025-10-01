import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TrpcModule } from './trpc/trpc.module';
import { AuthModule } from './auth/auth.module';
// import { WebhooksModule } from './webhooks/webhooks.module';
// Temporarily commented out problematic modules
// // Temporarily commented out problematic modules
// import { GmailModule } from './gmail/gmail.module';
import { KmsModule } from './kms/kms.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DatabaseModule,
    KmsModule,
    AuthModule,
    // GmailModule,
    TrpcModule,
    // WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
