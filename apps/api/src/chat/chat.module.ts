import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GeminiFunctionHandlerService } from '../gemini/gemini-function-handler.service';
import { UserApiKeyModule } from '../user-api-key/user-api-key.module';
import { PersonalityModule } from '../personality/personality.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [DatabaseModule, AuthModule, UserApiKeyModule, PersonalityModule, MemoryModule],
  providers: [ChatService, GeminiFunctionHandlerService],
  exports: [ChatService],
})
export class ChatModule {}
