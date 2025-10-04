import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, Trash2, Calendar, Filter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MedicalDocument {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  upload_date: string;
  extracted_text: string | null;
  ai_fitness_category: string | null;
  ai_recommendations: string | null;
}

export default function MedicalDocumentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("date");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user]);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }
      
      setUser(session.user);
    } catch (error) {
      console.error("Error checking user:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось проверить авторизацию",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("medical_documents")
        .select("*")
        .order("upload_date", { ascending: false });

      if (error) throw error;

      setDocuments(data || []);
    } catch (error) {
      console.error("Error loading documents:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить документы",
        variant: "destructive",
      });
    }
  };

  const compressImage = async (file: File): Promise<Blob> => {
    // Проверяем тип файла
    if (file.type === 'application/pdf') {
      // Для PDF возвращаем как есть
      return file;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          // Максимальные размеры
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;
          
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          }, 'image/jpeg', 0.8);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
    });
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !documentType || !user) {
      toast({
        title: "Ошибка",
        description: "Выберите файл и тип документа",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    try {
      // Компрессия изображения
      console.log("Starting file compression...");
      toast({
        title: "Обработка",
        description: "Сжатие изображения...",
      });

      const compressedBlob = await compressImage(selectedFile);
      console.log("File compressed successfully");
      
      // Загрузка в Supabase Storage
      const fileExtension = selectedFile.type === 'application/pdf' ? 'pdf' : 'jpg';
      const fileName = `${user.id}/${Date.now()}.${fileExtension}`;
      console.log("Uploading to storage:", fileName);
      
      const { error: uploadError } = await supabase.storage
        .from("medical-documents")
        .upload(fileName, compressedBlob, {
          contentType: selectedFile.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
          cacheControl: "3600",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }
      console.log("File uploaded successfully");

      // Конвертация в base64 для отправки в AI
      console.log("Converting to base64...");
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(compressedBlob);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to convert to base64'));
      });

      console.log("Starting AI analysis...");
      // Анализ документа с помощью AI
      toast({
        title: "Анализ",
        description: "ИИ анализирует документ...",
      });

      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        "analyze-medical-document",
        {
          body: {
            imageBase64: base64Image,
            documentType: documentType,
          },
        }
      );

      if (analysisError) {
        console.error("Analysis error:", analysisError);
      } else {
        console.log("AI analysis completed:", analysisData);
      }

      // Сохранение метаданных в базу данных
      console.log("Saving to database...");
      const { error: dbError } = await supabase
        .from("medical_documents")
        .insert({
          user_id: user.id,
          file_name: selectedFile.name,
          file_path: fileName,
          document_type: documentType,
          extracted_text: analysisData?.extractedText || null,
          ai_fitness_category: analysisData?.fitnessCategory || null,
          ai_recommendations: analysisData?.recommendations?.join('\n') || null,
        });

      if (dbError) {
        console.error("Database error:", dbError);
        throw dbError;
      }

      console.log("Document saved successfully");
      toast({
        title: "Успех",
        description: "Документ успешно загружен и проанализирован",
      });

      setSelectedFile(null);
      setDocumentType("");
      await loadDocuments();

    } catch (error: any) {
      console.error("Error uploading document:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось загрузить документ",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (id: string, filePath: string) => {
    try {
      // Удаление файла из Storage
      const { error: storageError } = await supabase.storage
        .from("medical-documents")
        .remove([filePath]);

      if (storageError) throw storageError;

      // Удаление записи из базы данных
      const { error: dbError } = await supabase
        .from("medical_documents")
        .delete()
        .eq("id", id);

      if (dbError) throw dbError;

      toast({
        title: "Успех",
        description: "Документ удален",
      });

      loadDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось удалить документ",
        variant: "destructive",
      });
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    switch (type) {
      case "analysis": return "Анализ";
      case "examination": return "Обследование";
      case "consultation": return "Консультация врача";
      default: return type;
    }
  };

  const sortedAndFilteredDocuments = documents
    .filter(doc => filterType === "all" || doc.document_type === filterType)
    .sort((a, b) => {
      if (sortBy === "date") {
        return new Date(b.upload_date).getTime() - new Date(a.upload_date).getTime();
      } else if (sortBy === "type") {
        return a.document_type.localeCompare(b.document_type);
      }
      return 0;
    });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <Header />
      
      <main className="container mx-auto px-4 py-8 mt-20">
        <div className="mb-8">
          <Button
            variant="outline"
            onClick={() => navigate("/profile")}
            className="mb-4"
          >
            ← Назад в профиль
          </Button>
          <h1 className="text-4xl font-bold mb-2">Медицинские документы</h1>
          <p className="text-muted-foreground">
            Загружайте и управляйте своими медицинскими документами
          </p>
        </div>

        {/* Форма загрузки */}
        <Card className="p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Загрузить документ</h2>
          <div className="grid gap-4">
            <div>
              <Label htmlFor="file">Файл (фото или PDF)</Label>
              <Input
                id="file"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                disabled={uploading}
              />
            </div>
            <div>
              <Label htmlFor="type">Тип документа</Label>
              <Select value={documentType} onValueChange={setDocumentType} disabled={uploading}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип документа" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analysis">Анализ</SelectItem>
                  <SelectItem value="examination">Обследование</SelectItem>
                  <SelectItem value="consultation">Консультация врача</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleFileUpload}
              disabled={!selectedFile || !documentType || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Обработка...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Загрузить
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Фильтры и сортировка */}
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">По дате</SelectItem>
                <SelectItem value="type">По типу</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="analysis">Анализы</SelectItem>
                <SelectItem value="examination">Обследования</SelectItem>
                <SelectItem value="consultation">Консультации</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Список документов */}
        <div className="grid gap-4">
          {sortedAndFilteredDocuments.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Документы не найдены</p>
            </Card>
          ) : (
            sortedAndFilteredDocuments.map((doc) => (
              <Card key={doc.id} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{doc.file_name}</h3>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>{getDocumentTypeLabel(doc.document_type)}</span>
                      <span>{new Date(doc.upload_date).toLocaleDateString('ru-RU')}</span>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDeleteDocument(doc.id, doc.file_path)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {doc.ai_fitness_category && (
                  <div className="bg-secondary/50 p-4 rounded-lg mb-4">
                    <h4 className="font-semibold mb-2">Анализ ИИ</h4>
                    <p className="mb-2">
                      <strong>Категория годности:</strong> {doc.ai_fitness_category}
                    </p>
                    {doc.ai_recommendations && (
                      <div>
                        <strong>Рекомендации:</strong>
                        <ScrollArea className="h-32 mt-2">
                          <pre className="text-sm whitespace-pre-wrap">{doc.ai_recommendations}</pre>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                )}

                {doc.extracted_text && (
                  <div>
                    <h4 className="font-semibold mb-2">Извлеченный текст</h4>
                    <ScrollArea className="h-48 bg-secondary/30 p-4 rounded-lg">
                      <pre className="text-sm whitespace-pre-wrap">{doc.extracted_text}</pre>
                    </ScrollArea>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}