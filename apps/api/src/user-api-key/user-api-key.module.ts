import { Module } from '@nestjs/common';
import { UserApiKeyService } from './user-api-key.service';
import { DatabaseModule } from '../database/database.module';
import { KmsModule } from '../kms/kms.module';

@Module({
  imports: [DatabaseModule, KmsModule],
  providers: [UserApiKeyService],
  exports: [UserApiKeyService],
})
export class UserApiKeyModule {}
