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
import { Upload, FileText, Loader2, Trash2, Calendar, Filter, Download, Eye } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import * as pdfjsLib from 'pdfjs-dist';

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

const DocumentViewer = ({ filePath, fileName }: { filePath: string; fileName: string }) => {
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadImage = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("medical-documents")
          .download(filePath);
        
        if (error) throw error;
        
        if (data) {
          const url = URL.createObjectURL(data);
          setImageUrl(url);
        }
      } catch (error) {
        console.error("Error loading image:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить изображение",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadImage();

    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [filePath]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Не удалось загрузить изображение
      </div>
    );
  }

  return (
    <img 
      src={imageUrl}
      alt={fileName}
      className="w-full h-auto"
    />
  );
};

export default function MedicalDocumentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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

  const convertPdfToJpeg = async (file: File): Promise<Blob> => {
    try {
      // Используем worker из node_modules вместо CDN
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      
      console.log("Reading PDF file...");
      const arrayBuffer = await file.arrayBuffer();
      
      console.log("Loading PDF document...");
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      console.log("Getting first page...");
      const page = await pdf.getPage(1); // Берем первую страницу
      
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Не удалось создать контекст canvas');
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      console.log("Rendering PDF page...");
      // @ts-ignore - RenderParameters type mismatch with pdfjs-dist
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      console.log("Converting to JPEG...");
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            console.log("PDF successfully converted to JPEG");
            resolve(blob);
          } else {
            reject(new Error('Не удалось конвертировать PDF в JPEG'));
          }
        }, 'image/jpeg', 0.9);
      });
    } catch (error) {
      console.error("Error converting PDF:", error);
      throw new Error(`Ошибка при конвертации PDF: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  };

  const mergeImagesVertically = async (imageBlobs: Blob[]): Promise<Blob> => {
    console.log(`Merging ${imageBlobs.length} images...`);
    
    // Загружаем все изображения
    const images = await Promise.all(
      imageBlobs.map(blob => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(blob);
        });
      })
    );

    // Вычисляем размеры итогового изображения
    const maxWidth = Math.max(...images.map(img => img.width));
    const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

    // Создаем canvas для объединенного изображения
    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Не удалось создать контекст canvas');
    }

    // Рисуем все изображения друг под другом
    let currentY = 0;
    for (const img of images) {
      const x = (maxWidth - img.width) / 2; // Центрируем изображение
      ctx.drawImage(img, x, currentY);
      currentY += img.height;
    }

    // Освобождаем память
    images.forEach(img => URL.revokeObjectURL(img.src));

    // Конвертируем в blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            console.log("Images merged successfully");
            resolve(blob);
          } else {
            reject(new Error('Не удалось создать объединенное изображение'));
          }
        },
        'image/jpeg',
        0.85
      );
    });
  };

  const compressImage = async (file: File): Promise<Blob> => {
    // Конвертация PDF в JPEG
    if (file.type === 'application/pdf') {
      console.log("Converting PDF to JPEG...");
      try {
        return await convertPdfToJpeg(file);
      } catch (error) {
        console.error("PDF conversion failed:", error);
        throw error;
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          let width = img.width;
          let height = img.height;
          const maxSize = 1920;

          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = (height / width) * maxSize;
              width = maxSize;
            } else {
              width = (width / height) * maxSize;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            0.85
          );
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async () => {
    if (selectedFiles.length === 0 || !documentType || !user) {
      toast({
        title: "Ошибка",
        description: "Выберите файл(ы) и тип документа",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    try {
      console.log(`Processing ${selectedFiles.length} file(s)...`);
      
      toast({
        title: "Обработка",
        description: `Обработка ${selectedFiles.length} файл(ов)...`,
      });

      // Конвертируем и сжимаем все файлы
      const processedBlobs = await Promise.all(
        selectedFiles.map(file => compressImage(file))
      );
      console.log("All files compressed/converted successfully");

      // Объединяем изображения, если файлов больше одного
      let finalBlob: Blob;
      let fileName: string;
      let smartFileName: string;

      if (processedBlobs.length > 1) {
        toast({
          title: "Объединение",
          description: "Объединение файлов в один документ...",
        });
        finalBlob = await mergeImagesVertically(processedBlobs);
        fileName = `${user.id}/${Date.now()}_merged.jpg`;
        smartFileName = `${getDocumentTypeLabel(documentType)}_${selectedFiles.length}файлов_${new Date().toLocaleDateString('ru-RU')}.jpg`;
      } else {
        finalBlob = processedBlobs[0];
        fileName = `${user.id}/${Date.now()}.jpg`;
        smartFileName = selectedFiles[0].name.replace(/\.[^/.]+$/, "") + '.jpg';
      }

      console.log("Final blob size:", finalBlob.size);
      console.log("Uploading to storage:", fileName);
      
      // Загрузка в Supabase Storage
      toast({
        title: "Загрузка",
        description: "Загрузка в хранилище...",
      });

      const { error: uploadError } = await supabase.storage
        .from("medical-documents")
        .upload(fileName, finalBlob, {
          contentType: 'image/jpeg',
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
        reader.readAsDataURL(finalBlob);
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
        toast({
          title: "Предупреждение",
          description: "Документ загружен, но AI анализ не удался.",
        });
      } else {
        console.log("AI analysis completed:", analysisData);
      }

      // Обновляем имя файла если есть извлеченный текст
      if (analysisData?.extractedText && processedBlobs.length === 1) {
        const docTypeLabel = getDocumentTypeLabel(documentType);
        const dateStr = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const shortText = analysisData.extractedText.substring(0, 50).replace(/[^\wа-яА-Я\s]/g, '').trim();
        smartFileName = `${docTypeLabel}_${dateStr}_${shortText.substring(0, 30)}.jpg`;
      }

      // Сохранение метаданных в базу данных
      console.log("Saving to database...");
      const { error: dbError } = await supabase
        .from("medical_documents")
        .insert({
          user_id: user.id,
          file_name: smartFileName,
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
        description: selectedFiles.length > 1 
          ? `${selectedFiles.length} файл(ов) объединены и загружены` 
          : "Документ успешно загружен и проанализирован",
      });

      setSelectedFiles([]);
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
              <Label htmlFor="file">
                Файл(ы) (фото или PDF)
                {selectedFiles.length > 0 && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    ({selectedFiles.length} выбрано)
                  </span>
                )}
              </Label>
              <Input
                id="file"
                type="file"
                accept="image/*,.pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) setSelectedFiles(files);
                }}
                disabled={uploading}
              />
              {selectedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {selectedFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between text-sm bg-secondary/30 px-3 py-2 rounded"
                    >
                      <span className="truncate flex-1 mr-2">{file.name}</span>
                      <button
                        onClick={() => setSelectedFiles(files => files.filter((_, i) => i !== index))}
                        className="text-destructive hover:text-destructive/80 font-semibold"
                        disabled={uploading}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
              disabled={selectedFiles.length === 0 || !documentType || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Обработка...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {selectedFiles.length > 1 ? `Загрузить и объединить (${selectedFiles.length})` : "Загрузить"}
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

                <div className="flex gap-4 mb-4">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const { data, error } = await supabase.storage
                          .from("medical-documents")
                          .download(doc.file_path);
                        
                        if (error) throw error;
                        
                        if (data) {
                          const url = URL.createObjectURL(data);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = doc.file_name;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          toast({
                            title: "Успех",
                            description: "Документ скачан",
                          });
                        }
                      } catch (error) {
                        console.error("Download error:", error);
                        toast({
                          title: "Ошибка",
                          description: "Не удалось скачать документ",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Скачать
                  </Button>
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Eye className="h-4 w-4 mr-2" />
                        Просмотр
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh]">
                      <DialogHeader>
                        <DialogTitle>{doc.file_name}</DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="h-[70vh] w-full">
                        <DocumentViewer filePath={doc.file_path} fileName={doc.file_name} />
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="mb-4">
                      <FileText className="h-4 w-4 mr-2" />
                      Резюме ИИ
                    </Button>
                  </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh]">
                      <DialogHeader>
                        <DialogTitle>Резюме анализа ИИ</DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="h-[60vh] pr-4">
                        <div className="space-y-4">
                          {doc.ai_fitness_category && (
                            <div>
                              <h4 className="font-semibold mb-2">Категория годности:</h4>
                              <p>{doc.ai_fitness_category}</p>
                            </div>
                          )}
                          {doc.ai_recommendations && (
                            <div>
                              <h4 className="font-semibold mb-2">Рекомендации:</h4>
                              <pre className="text-sm whitespace-pre-wrap">{doc.ai_recommendations}</pre>
                            </div>
                          )}
                          {!doc.ai_fitness_category && !doc.ai_recommendations && (
                            <p className="text-muted-foreground">Резюме ИИ пока недоступно. Попробуйте загрузить документ заново.</p>
                          )}
                        </div>
                      </ScrollArea>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `Категория годности: ${doc.ai_fitness_category}\n\nРекомендации:\n${doc.ai_recommendations}`
                            );
                            toast({
                              title: "Скопировано",
                              description: "Резюме скопировано в буфер обмена",
                            });
                          }}
                        >
                          Копировать
                        </Button>
                        <Button
                          onClick={() => {
                            const text = `Категория годности: ${doc.ai_fitness_category}\n\nРекомендации:\n${doc.ai_recommendations}`;
                            const blob = new Blob([text], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `резюме-${doc.file_name}.txt`;
                            a.click();
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Скачать
                        </Button>
                      </div>
                    </DialogContent>
                </Dialog>

                {doc.extracted_text && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <FileText className="h-4 w-4 mr-2" />
                        Извлеченный текст
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh]">
                      <DialogHeader>
                        <DialogTitle>Извлеченный текст</DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="h-[60vh] pr-4">
                        <pre className="text-sm whitespace-pre-wrap">{doc.extracted_text}</pre>
                      </ScrollArea>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(doc.extracted_text || '');
                            toast({
                              title: "Скопировано",
                              description: "Текст скопирован в буфер обмена",
                            });
                          }}
                        >
                          Копировать
                        </Button>
                        <Button
                          onClick={() => {
                            const blob = new Blob([doc.extracted_text || ''], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `текст-${doc.file_name}.txt`;
                            a.click();
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Скачать
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
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