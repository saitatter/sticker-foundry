import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.teamsService.list(user.sub);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(user.sub, dto);
  }

  @Get(':id/members')
  members(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.teamsService.members(user.sub, id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AddTeamMemberDto) {
    return this.teamsService.addMember(user.sub, id, dto);
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamsService.updateMember(user.sub, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.teamsService.removeMember(user.sub, id, memberId);
  }
}
