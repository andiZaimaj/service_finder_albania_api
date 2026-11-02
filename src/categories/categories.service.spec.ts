import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: { category: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { category: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  it('lists categories alphabetically', async () => {
    prisma.category.findMany.mockResolvedValue([
      { id: 'c1', name: 'Cleaning', slug: 'cleaning', iconUrl: null },
      { id: 'c2', name: 'Plumbing', slug: 'plumbing', iconUrl: null },
    ]);

    const result = await service.listAll();

    const args = (
      prisma.category.findMany.mock.calls as Record<string, unknown>[][]
    )[0][0];
    expect(args).toMatchObject({ orderBy: { name: 'asc' } });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Cleaning');
  });
});
