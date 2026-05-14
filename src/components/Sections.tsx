import heroImageUrl from "../../assets/hero1.png";
import previewImageUrl from "../../assets/hero2.png";
import planningImageUrl from "../../assets/hero3.png";
import recipeImageUrl from "../../assets/hero4.png";
import logoUrl from "../../assets/1500_logo.png";
import consistencyIconUrl from "../../assets/consistency.png";
import fastIconUrl from "../../assets/fast.png";
import targetIconUrl from "../../assets/target.png";

const imageBaseUrl = "https://pub-ca0d2945e40f4c42b8f7e426869cb575.r2.dev/images";
const contactHref = "mailto:nick@shedlab.studio?subject=Fifteen%20Hundred%20creator%20partnership";

const imageUrl = (name: string) => `${imageBaseUrl}/${name}`;

const features = [
  {
    title: "Built around consistency",
    copy: "A clear daily target keeps the focus on showing up, not chasing a perfect day.",
    icon: consistencyIconUrl,
  },
  {
    title: "Fast meal logging",
    copy: "Log meals quickly, reuse familiar foods, and get back to real life.",
    icon: fastIconUrl,
  },
  {
    title: "Simple daily targets",
    copy: "The app defaults to a straightforward calorie goal and keeps the plan visible.",
    icon: targetIconUrl,
  },
];

const previewCards = [
  {
    eyebrow: "Onboarding",
    title: "Set a daily target",
    image: "/screenshots/onboarding-preview.png",
  },
  {
    eyebrow: "Timeline",
    title: "Meals stay organized",
    image: "/screenshots/meal-timeline-preview.png",
  },
  {
    eyebrow: "Food cards",
    title: "Visual meal ideas",
    image: "/screenshots/food-card-preview.png",
  },
];

const benefits = [
  "Easy product to explain",
  "Strong visual app demo",
  "Broad weight-loss appeal",
  "Clear audience value",
];

const mealPlanningPoints = [
  "Plan the week around a simple calorie target",
  "Keep breakfast, lunch, dinner, and snacks organized",
  "Make consistency feel less like daily guesswork",
];

const recipePoints = [
  "Easy meal concepts that perform well on Reels, Shorts, and TikTok",
  "Clean visual cards that make recipes effortless to explain on camera",
  "Repeatable meal ideas followers can build into everyday routines",
];

export function Hero() {
  return (
    <section className="hero section-shell">
      <nav className="nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Fifteen Hundred home">
          <img className="brand-logo" src={logoUrl} alt="1500" />
        </a>
        <a className="nav-link" href={contactHref}>
          Partner
        </a>
      </nav>

      <div className="hero-grid" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Creator partnerships</p>
          <h1>A simpler way to stay in a calorie deficit.</h1>
          <p className="hero-subhead">
            Fifteen Hundred helps people plan, track, and stay consistent without turning food into a full-time job.
          </p>
          <div className="cta-row">
            <a className="button button-primary" href={contactHref}>
              Partner with us
            </a>
            <a className="button button-secondary" href="#app-preview">
              Watch app preview
            </a>
          </div>
        </div>

        <div className="hero-visual" aria-label="Fifteen Hundred app preview">
          <img className="hero-image" src={heroImageUrl} alt="Fifteen Hundred app preview" />
        </div>
      </div>
    </section>
  );
}

export function FeatureGrid() {
  return (
    <section className="section-shell split-section">
      <div className="section-heading">
        <p className="eyebrow">Why it works</p>
        <h2>Simple enough to become a habit.</h2>
      </div>
      <div className="card-grid three-up">
        {features.map((feature) => (
          <article className="feature-card" key={feature.title}>
            <img className="feature-icon" src={feature.icon} alt="" />
            <h3>{feature.title}</h3>
            <p>{feature.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AppPreview() {
  return (
    <section className="section-shell app-preview" id="app-preview">
      <div className="section-heading centered">
        <p className="eyebrow">App preview</p>
        <h2>Custom, simple food imagery and search.</h2>
      </div>
      <div className="preview-stage">
        <div className="preview-main">
          <img className="preview-image" src={previewImageUrl} alt="Fifteen Hundred food imagery and search preview" />
        </div>
        <div className="preview-grid">
          {previewCards.map((card) => (
            <article className="preview-card" key={card.title}>
              <img src={card.image} alt="" />
              <div>
                <p>{card.eyebrow}</p>
                <h3>{card.title}</h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MealPlanning() {
  return (
    <section className="section-shell detail-section">
      <div className="detail-copy">
        <p className="eyebrow">Meal planning</p>
        <h2>Plan ahead without turning it into a spreadsheet.</h2>
        <p>
          Fifteen Hundred gives people a simple way to map meals around their daily target, so staying consistent
          feels planned instead of improvised.
        </p>
        <ul className="detail-list">
          {mealPlanningPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
      <div className="detail-visual">
        <img className="detail-image" src={planningImageUrl} alt="Fifteen Hundred meal planning preview" />
      </div>
    </section>
  );
}

export function Recipes() {
  return (
    <section className="section-shell detail-section detail-section-flipped">
      <div className="detail-visual">
        <img
          className="detail-image detail-image-compact"
          src={recipeImageUrl}
          alt="Fifteen Hundred recipe content preview"
        />
      </div>
      <div className="detail-copy">
        <p className="eyebrow">Recipes</p>
        <h2>Content your audience will actually save and remake.</h2>
        <ul className="detail-list">
          {recipePoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p>
          The app turns simple meals into highly shareable content, giving creators an endless stream of realistic
          recipe ideas their audience can actually stick to, save, and come back for.
        </p>
      </div>
    </section>
  );
}

export function BenefitGrid() {
  return (
    <section className="section-shell split-section">
      <div className="section-heading">
        <p className="eyebrow">Creator benefits</p>
        <h2>A product your audience can understand in seconds.</h2>
      </div>
      <div className="card-grid four-up">
        {benefits.map((benefit, index) => (
          <article className="benefit-card" key={benefit}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{benefit}</h3>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="section-shell final-cta">
      <p className="eyebrow">Launch partners</p>
      <h2>Want to partner on the launch?</h2>
      <p>
        Open to YouTube integrations, Instagram reels, TikTok-style demos, affiliate campaigns, and sponsored content.
      </p>
      <a className="button button-primary" href={contactHref}>
        Get in touch
      </a>
    </section>
  );
}

function PhoneMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "phone phone-compact" : "phone"}>
      <div className="phone-speaker" />
      <div className="phone-screen">
        <div className="app-header">
          <span>Today</span>
          <b>May 11</b>
        </div>
        <div className="calorie-hero">
          <span>Remaining</span>
          <strong>580</strong>
          <p>920 of 1500 used</p>
          <div className="macro-line">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="meal-list">
          <div className="meal-row">
            <img src={imageUrl("greek-yogurt-cup.png")} alt="" />
            <div>
              <b>Greek yogurt</b>
              <span>180 cal</span>
            </div>
          </div>
          <div className="meal-row">
            <img src={imageUrl("food-card-preview.png")} alt="" />
            <div>
              <b>Protein pancakes</b>
              <span>340 cal</span>
            </div>
          </div>
          <div className="target-card">
            <span>Simple daily target</span>
            <strong>1500 cal</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
