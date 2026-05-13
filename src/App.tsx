import {
  AppPreview,
  BenefitGrid,
  FeatureGrid,
  FinalCta,
  Hero,
  MealPlanning,
  Recipes,
} from "./components/Sections";

export default function App() {
  return (
    <main>
      <Hero />
      <FeatureGrid />
      <AppPreview />
      <MealPlanning />
      <Recipes />
      <BenefitGrid />
      <FinalCta />
    </main>
  );
}
