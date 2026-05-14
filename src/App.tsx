import {
  AppPreview,
  BenefitGrid,
  FeatureGrid,
  FinalCta,
  Hero,
  MealPlanning,
  Recipes,
} from "./components/Sections";
import Admin from "./Admin";

export default function App() {
  const redirectedPath = new URLSearchParams(window.location.search).get("redirect");
  if (window.location.pathname.startsWith("/admin") || redirectedPath?.startsWith("/admin")) {
    return <Admin />;
  }

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
