import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ImportUrls = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    imported: 0,
    skipped: 0,
    errors: 0
  });

  const handleImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setStats({ total: 0, imported: 0, skipped: 0, errors: 0 });

    try {
      // Fetch the URLs file
      const response = await fetch("/urls.txt");
      const text = await response.text();
      
      // Parse URLs
      const urls = text
        .split("\n")
        .map(url => url.trim())
        .filter(url => url.length > 0 && (url.startsWith("http://") || url.startsWith("https://")));
      
      // Remove duplicates
      const uniqueUrls = [...new Set(urls)];
      setStats(prev => ({ ...prev, total: uniqueUrls.length }));
      
      toast.info(`Found ${uniqueUrls.length} unique URLs to import`);

      // Process in batches of 500
      const batchSize = 500;
      let imported = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 0; i < uniqueUrls.length; i += batchSize) {
        const batch = uniqueUrls.slice(i, i + batchSize);
        
        try {
          const { data, error } = await supabase.functions.invoke("import-urls", {
            body: { urls: batch }
          });

          if (error) {
            console.error("Batch error:", error);
            errors += batch.length;
          } else if (data?.success) {
            imported += data.processed || 0;
          }
        } catch (err) {
          console.error("Batch error:", err);
          errors += batch.length;
        }

        // Update progress
        const progressPercent = Math.round(((i + batch.length) / uniqueUrls.length) * 100);
        setProgress(progressPercent);
        setStats(prev => ({ ...prev, imported, skipped, errors }));
      }

      // Get final count
      const { count } = await supabase
        .from("gateway_urls")
        .select("*", { count: "exact", head: true });

      toast.success(`Import complete! ${count || 0} URLs in database`);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Import failed: " + (error as Error).message);
    } finally {
      setIsImporting(false);
      setProgress(100);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Import Gateway URLs</CardTitle>
          <CardDescription>
            Import URLs from the uploaded file into the database
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-muted-foreground">Total URLs</div>
              <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg">
              <div className="text-muted-foreground">Imported</div>
              <div className="text-2xl font-bold text-green-600">{stats.imported.toLocaleString()}</div>
            </div>
          </div>

          <Button 
            onClick={handleImport} 
            disabled={isImporting}
            className="w-full"
          >
            {isImporting ? "Importing..." : "Start Import"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ImportUrls;
