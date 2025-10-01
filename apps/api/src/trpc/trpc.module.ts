import { Module } from '@nestjs/common';
import { TrpcService } from './trpc.service';
import { TrpcMinimalRouter } from './trpc-minimal.router';
// Temporarily commented out problematic services
// import { EmailService } from './routers/email.service';
// import { CalendarService } from './routers/calendar.service';
// import { AutomationService } from './routers/automation.service';
import { ChatModule } from '../chat/chat.module';
import { GeminiFunctionHandlerService } from '../gemini/gemini-function-handler.service';
import { AuthModule } from '../auth/auth.module';
import { UserApiKeyModule } from '../user-api-key/user-api-key.module';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
import { PersonalityModule } from '../personality/personality.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [AuthModule, UserApiKeyModule, UserPreferencesModule, ChatModule, PersonalityModule, MemoryModule],
  providers: [
    TrpcService, 
    TrpcMinimalRouter,
    // EmailService,
    // CalendarService,
    // AutomationService,
    GeminiFunctionHandlerService,
  ],
  exports: [TrpcService, TrpcMinimalRouter],
})
export class TrpcModule {}
