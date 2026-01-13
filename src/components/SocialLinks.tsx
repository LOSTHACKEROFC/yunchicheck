import { Facebook, Github, Linkedin, Twitter } from "lucide-react";

const socialLinks = [
  { icon: Facebook, href: "#", label: "Facebook" },
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Github, href: "#", label: "GitHub" },
];

const SocialLinks = () => {
  return (
    <div className="flex flex-col gap-4">
      {socialLinks.map((social) => (
        <a
          key={social.label}
          href={social.href}
          className="social-icon"
          aria-label={social.label}
        >
          <social.icon size={18} />
        </a>
      ))}
    </div>
  );
};

export default SocialLinks;
