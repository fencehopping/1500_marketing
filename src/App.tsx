import {
  AppPreview,
  BenefitGrid,
  FeatureGrid,
  FinalCta,
  Hero,
} from "./components/Sections";

export default function App() {
  return (
    <main>
      <Hero />
      <FeatureGrid />
      <AppPreview />
      <BenefitGrid />
      <FinalCta />
    </main>
  );
}
