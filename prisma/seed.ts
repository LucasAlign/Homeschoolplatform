import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const user = await db.user.upsert({
    where: { email: "parent@homeschool.local" },
    update: {},
    create: { email: "parent@homeschool.local", name: "Demo Parent" },
  });

  // Start clean so re-seeding is idempotent.
  await db.course.deleteMany({ where: { ownerId: user.id } });

  await db.course.create({
    data: {
      title: "5th Grade Math",
      subject: "Mathematics",
      gradeLevel: "Grade 5",
      description: "Fractions, decimals, and an introduction to geometry.",
      published: true,
      ownerId: user.id,
      units: {
        create: [
          {
            title: "Fractions",
            order: 0,
            lessons: {
              create: [
                {
                  title: "Understanding Fractions",
                  order: 0,
                  published: true,
                  content:
                    "A fraction represents a part of a whole.\n\nThe top number (numerator) tells how many parts we have; the bottom number (denominator) tells how many equal parts make the whole.\n\nActivity: Fold a piece of paper into 4 equal parts and shade 3 of them — that's 3/4.",
                },
                {
                  title: "Adding Fractions",
                  order: 1,
                  published: true,
                  content:
                    "To add fractions with the same denominator, add the numerators and keep the denominator.\n\nExample: 1/5 + 2/5 = 3/5.\n\nTry: 2/8 + 3/8 = ?",
                },
              ],
            },
          },
          {
            title: "Decimals",
            order: 1,
            lessons: {
              create: [
                {
                  title: "Place Value of Decimals",
                  order: 0,
                  content:
                    "Digits after the decimal point represent tenths, hundredths, and thousandths.\n\nExample: 0.25 = twenty-five hundredths.",
                },
              ],
            },
          },
        ],
      },
    },
  });

  await db.course.create({
    data: {
      title: "Intro to Biology",
      subject: "Science",
      gradeLevel: "Grade 6",
      description: "Cells, living systems, and the natural world.",
      ownerId: user.id,
      units: {
        create: [
          {
            title: "Cells",
            order: 0,
            lessons: {
              create: [
                {
                  title: "What is a Cell?",
                  order: 0,
                  content: "Cells are the basic building blocks of all living things.",
                },
              ],
            },
          },
        ],
      },
    },
  });

  const courses = await db.course.count({ where: { ownerId: user.id } });
  console.log(`Seeded ${courses} courses for ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
