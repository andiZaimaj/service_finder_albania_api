import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateProposalDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  message!: string;

  @ApiProperty({ example: 150.0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceEstimate!: number;
}
