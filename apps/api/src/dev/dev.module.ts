import { Module } from '@nestjs/common';
import { DevUserService } from './dev-user.service';
import { DevController } from './dev.controller';
import { DatabaseModule } from '../database/database.module';
import { UserApiKeyModule } from '../user-api-key/user-api-key.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';

@Module({
  imports: [
    DatabaseModule,
    UserApiKeyModule,
    UserPreferencesModule,
  ],
  controllers: [DevController],
  providers: [DevUserService],
  exports: [DevUserService],
})
export class DevModule {}
