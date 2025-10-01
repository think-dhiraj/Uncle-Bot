import { Module } from '@nestjs/common';
import { GmailSyncService } from './gmail-sync.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [GmailSyncService],
  exports: [GmailSyncService],
})
export class GmailModule {}
