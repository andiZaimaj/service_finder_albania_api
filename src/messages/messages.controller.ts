import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('messages')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message' })
  @ApiResponse({ status: 201 })
  send(@CurrentUser() user: JwtPayload, @Body() dto: SendMessageDto) {
    return this.messagesService.send(
      user.sub,
      dto.receiverId,
      dto.jobPostId,
      dto.content,
    );
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List conversations (grouped by other participant)' })
  @ApiResponse({ status: 200 })
  conversations(@CurrentUser() user: JwtPayload) {
    return this.messagesService.listConversations(user.sub);
  }

  @Get('conversations/:userId')
  @ApiOperation({ summary: 'Message thread with another user' })
  @ApiResponse({ status: 200 })
  thread(
    @CurrentUser() user: JwtPayload,
    @Param('userId') otherUserId: string,
  ) {
    return this.messagesService.getThread(user.sub, otherUserId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark message as read' })
  @ApiResponse({ status: 200 })
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.messagesService.markRead(user.sub, id);
  }
}
