-- Create notifications table for all notification types
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ticket_reply', 'balance_update', 'system', 'topup')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Service role can insert notifications
CREATE POLICY "Service role can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create function to create notification on ticket reply
CREATE OR REPLACE FUNCTION public.notify_on_admin_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket_subject TEXT;
  ticket_user_id UUID;
BEGIN
  IF NEW.is_admin = true THEN
    SELECT subject, user_id INTO ticket_subject, ticket_user_id
    FROM public.support_tickets
    WHERE id = NEW.ticket_id;
    
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      ticket_user_id,
      'ticket_reply',
      'New Reply: ' || ticket_subject,
      NEW.message,
      jsonb_build_object('ticket_id', NEW.ticket_id, 'message_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for admin replies
CREATE TRIGGER on_admin_ticket_reply
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_admin_reply();

-- Create function to notify on balance update
CREATE OR REPLACE FUNCTION public.notify_on_balance_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  balance_diff NUMERIC;
  notif_title TEXT;
  notif_message TEXT;
BEGIN
  balance_diff := NEW.balance - OLD.balance;
  
  IF balance_diff != 0 THEN
    IF balance_diff > 0 THEN
      notif_title := 'Balance Added';
      notif_message := 'Your balance has been credited with $' || TO_CHAR(balance_diff, 'FM999999990.00');
    ELSE
      notif_title := 'Balance Deducted';
      notif_message := 'Your balance has been deducted by $' || TO_CHAR(ABS(balance_diff), 'FM999999990.00');
    END IF;
    
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.user_id,
      'balance_update',
      notif_title,
      notif_message,
      jsonb_build_object('old_balance', OLD.balance, 'new_balance', NEW.balance, 'difference', balance_diff)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for balance changes
CREATE TRIGGER on_balance_change
  AFTER UPDATE OF balance ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_balance_change();