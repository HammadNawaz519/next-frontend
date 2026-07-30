const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanTestData() {
  console.log('--- Cleaning Test & Mock Data from Database ---');

  try {
    // 1. Find all test users with @example.com or test usernames
    const testUsers = await prisma.user.findMany({
      where: {
        OR: [
          { email: { endsWith: '@example.com' } },
          { email: { contains: 'test' } },
          { username: { in: ['alex_ray', 'sarah_k', 'mia.ux', 'dev_dan', 'reel_creator'] } }
        ]
      }
    });

    console.log(`Found ${testUsers.length} test user(s) to remove:`, testUsers.map(u => u.email));

    const testUserIds = testUsers.map(u => u.id);

    if (testUserIds.length > 0) {
      // 2. Delete posts by test users
      const deletedPosts = await prisma.post.deleteMany({
        where: { userId: { in: testUserIds } }
      });
      console.log(`Deleted ${deletedPosts.count} post(s) created by test users.`);

      // 3. Delete comments by test users
      const deletedComments = await prisma.comment.deleteMany({
        where: { userId: { in: testUserIds } }
      });
      console.log(`Deleted ${deletedComments.count} comment(s) created by test users.`);

      // 4. Delete likes by test users
      const deletedLikes = await prisma.like.deleteMany({
        where: { userId: { in: testUserIds } }
      });
      console.log(`Deleted ${deletedLikes.count} like(s) created by test users.`);

      // 5. Delete test users
      const deletedUsers = await prisma.user.deleteMany({
        where: { id: { in: testUserIds } }
      });
      console.log(`Deleted ${deletedUsers.count} test user(s) from database.`);
    }

    // 6. Delete posts that use unsplash sample images or mixkit video URLs if any remain
    const samplePosts = await prisma.post.deleteMany({
      where: {
        OR: [
          { imageUrl: { contains: 'images.unsplash.com' } },
          { imageUrl: { contains: 'assets.mixkit.co' } }
        ]
      }
    });
    console.log(`Deleted ${samplePosts.count} leftover sample post(s)/reel(s).`);

    console.log('Database cleanup completed successfully!');
  } catch (err) {
    console.error('Error cleaning database test data:', err);
  } finally {
    await prisma.$disconnect();
  }
}

cleanTestData();
