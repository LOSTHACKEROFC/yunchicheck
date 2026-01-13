import { useState } from "react";
import { Menu, X } from "lucide-react";

const navLinks = [
  { name: "Home", href: "#home", active: true },
  { name: "About", href: "#about" },
  { name: "Services", href: "#services" },
  { name: "Resume", href: "#resume" },
  { name: "Projects", href: "#projects" },
  { name: "Contact", href: "#contact" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="#home" className="text-2xl font-bold text-foreground">
            Maks<span className="text-primary">.</span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`nav-link ${link.active ? "nav-link-active" : ""}`}
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Hire Me Button */}
          <a href="#contact" className="hidden md:block btn-primary text-primary-foreground">
            Hire me
          </a>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-foreground"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-border/50 pt-4 animate-fade-in">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className={`nav-link ${link.active ? "nav-link-active" : ""}`}
                  onClick={() => setIsOpen(false)}
                >
                  {link.name}
                </a>
              ))}
              <a href="#contact" className="btn-primary text-primary-foreground text-center mt-4">
                Hire me
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
