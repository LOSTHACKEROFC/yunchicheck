import SocialLinks from "./SocialLinks";

interface HeroSectionProps {
  profileImage: string;
}

const HeroSection = ({ profileImage }: HeroSectionProps) => {
  return (
    <section
      id="home"
      className="min-h-screen flex items-center relative overflow-hidden pt-20"
    >
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-12 gap-8 items-center">
          {/* Social Links - Left Side */}
          <div className="hidden lg:flex lg:col-span-1 justify-center">
            <SocialLinks />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-6 space-y-6 animate-slide-in-left">
            <div className="flex items-center gap-2">
              <div className="h-px w-12 bg-primary"></div>
              <span className="text-muted-foreground text-sm uppercase tracking-widest">
                Hello I'm
              </span>
            </div>

            <h1 className="hero-title">Maks</h1>

            <div className="space-y-2">
              <p className="text-xl md:text-2xl font-light text-foreground">
                Freelancer <span className="text-primary font-semibold">Web Developer</span>
              </p>
              <p className="text-xl md:text-2xl font-light text-foreground">
                & <span className="text-primary font-semibold">UI Designer</span>
              </p>
            </div>

            <p className="text-muted-foreground max-w-md leading-relaxed">
              I create beautiful and functional digital experiences. Let's build something amazing together.
            </p>

            <div className="flex gap-4 pt-4">
              <a href="#projects" className="btn-primary text-primary-foreground">
                View Projects
              </a>
              <a
                href="#contact"
                className="px-6 py-3 rounded-full border border-border text-foreground hover:border-primary hover:text-primary transition-all duration-300"
              >
                Contact Me
              </a>
            </div>

            {/* Mobile Social Links */}
            <div className="flex lg:hidden gap-4 pt-4">
              <SocialLinks />
            </div>
          </div>

          {/* Profile Image */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end animate-slide-in-right">
            <div className="profile-glow">
              <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-full overflow-hidden border-4 border-secondary animate-float">
                <img
                  src={profileImage}
                  alt="Maks - Web Developer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Page Indicators */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          <div className="dot-indicator dot-indicator-active rounded-full transition-all duration-300"></div>
          <div className="dot-indicator rounded-full transition-all duration-300"></div>
          <div className="dot-indicator rounded-full transition-all duration-300"></div>
        </div>
      </div>

      {/* Background Decorations */}
      <div className="absolute top-1/4 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/4 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10"></div>
    </section>
  );
};

export default HeroSection;
