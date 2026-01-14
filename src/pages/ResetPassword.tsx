import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to auth page with forgot password state
    toast.info("Please use the forgot password option to reset your password");
    navigate("/auth");
  }, [navigate]);

  return null;
};

export default ResetPassword;