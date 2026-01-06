import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, Trash2, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown, X, Eye, Brain, Copy, Check, ExternalLink, AlertCircle, Sparkles, Printer } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface MedicalDocument {
  id: string;
  title: string | null;
  file_url: string;
  document_date: string | null;
  uploaded_at: string;
  is_classified: boolean;
  document_type_id: string | null;
  raw_text: string | null;
  ai_fitness_category: string | null;
  ai_category_chance: number | null;
  ai_recommendations: string[] | null;
  ai_explanation: string | null;
  linked_article_id: string | null;
  document_types?: DocumentType | null;
  disease_articles_565?: { article_number: string; title: string } | null;
}

type SortField = "uploaded_at" | "document_date" | "title";
type SortDirection = "asc" | "desc";

export default function MedicalDocumentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Filters & Sorting
  const [filterType, setFilterType] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("uploaded_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

  // Selected document for details view
  const [selectedDocument, setSelectedDocument] = useState<MedicalDocument | null>(null);

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadDocuments();
      loadDocumentTypes();
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
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentTypes = async () => {
    const { data, error } = await supabase
      .from("document_types")
      .select("id, code, name")
      .eq("is_active", true);

    if (!error && data) {
      setDocumentTypes(data);
    }
  };

  const loadDocuments = async () => {
    const { data, error } = await supabase
      .from("medical_documents_v2")
      .select(`
        id,
        title,
        file_url,
        document_date,
        uploaded_at,
        is_classified,
        document_type_id,
        raw_text,
        ai_fitness_category,
        ai_category_chance,
        ai_recommendations,
        ai_explanation,
        linked_article_id,
        document_types (id, code, name),
        disease_articles_565 (article_number, title)
      `)
      .eq("user_id", user.id)
      .order("uploaded_at", { ascending: false });

    if (!error && data) {
      setDocuments(data as unknown as MedicalDocument[]);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    await uploadFiles(files);
  }, [user]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      await uploadFiles(files);
    }
  };

  // Конвертация файла в JPEG с максимальным качеством
  const convertToJpeg = async (file: File): Promise<{ blob: Blob; base64: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        
        // Если это PDF, используем оригинальный файл и конвертируем первую страницу
        if (file.type === "application/pdf") {
          // Для PDF возвращаем base64 напрямую - AI обработает
          const base64 = result.split(',')[1];
          resolve({ blob: file, base64 });
          return;
        }
        
        // Для изображений конвертируем в JPEG
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const jpegReader = new FileReader();
                jpegReader.onload = () => {
                  const base64 = (jpegReader.result as string).split(',')[1];
                  resolve({ blob, base64 });
                };
                jpegReader.readAsDataURL(blob);
              } else {
                reject(new Error("Failed to convert image"));
              }
            },
            'image/jpeg',
            0.95 // Высокое качество
          );
        };
        img.onerror = reject;
        img.src = result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const uploadFiles = async (files: File[]) => {
    if (!user) return;

    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    const validFiles = files.filter(f => validTypes.includes(f.type));

    if (validFiles.length === 0) {
      toast({
        title: "Неподдерживаемый формат",
        description: "Загружайте PDF или изображения (JPEG, PNG, WebP)",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    for (const file of validFiles) {
      try {
        // Конвертируем в JPEG
        const { blob: jpegBlob, base64 } = await convertToJpeg(file);
        
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

        // Загружаем JPEG версию
        const { error: uploadError } = await supabase.storage
          .from("medical-documents")
          .upload(fileName, jpegBlob, {
            contentType: 'image/jpeg'
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("medical-documents")
          .getPublicUrl(fileName);

        // Создаём запись в базе
        const { data: insertedDoc, error: insertError } = await supabase
          .from("medical_documents_v2")
          .insert({
            user_id: user.id,
            title: file.name,
            file_url: publicUrl,
            is_classified: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        toast({
          title: "Документ загружен",
          description: "Запускаем AI-анализ...",
        });

        // Запускаем AI анализ автоматически
        if (insertedDoc) {
          analyzeDocument(insertedDoc.id, base64);
        }
      } catch (error: any) {
        toast({
          title: "Ошибка загрузки",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    setUploading(false);
    loadDocuments();
  };

  const analyzeDocument = async (documentId: string, imageBase64?: string) => {
    setAnalyzingId(documentId);
    
    try {
      let base64 = imageBase64;
      
      // Если base64 не передан, загружаем из URL
      if (!base64) {
        const doc = documents.find(d => d.id === documentId);
        if (!doc) throw new Error("Документ не найден");
        
        const response = await fetch(doc.file_url);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      const { data, error } = await supabase.functions.invoke('analyze-medical-document', {
        body: { imageBase64: base64, documentId, userId: user.id }
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Ошибка анализа",
          description: data.message || "Попробуйте позже",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Анализ завершён",
          description: `Категория: ${data.fitnessCategory}, шанс категории В: ${data.categoryBChance}%`,
        });
      }

      loadDocuments();
    } catch (error: any) {
      console.error("Analysis error:", error);
      toast({
        title: "Ошибка анализа",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleDeleteDocument = async (doc: MedicalDocument) => {
    try {
      const urlParts = doc.file_url.split("/");
      const filePath = urlParts.slice(-2).join("/");

      await supabase.storage
        .from("medical-documents")
        .remove([filePath]);

      const { error } = await supabase
        .from("medical_documents_v2")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast({
        title: "Документ удалён",
        description: doc.title || "Без названия",
      });

      loadDocuments();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyExtractedText = async (text: string, docId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(docId);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Текст скопирован" });
  };

  const downloadAsText = (doc: MedicalDocument) => {
    if (!doc.raw_text) return;
    const blob = new Blob([doc.raw_text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title || 'document'}_text.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadDocument = (doc: MedicalDocument) => {
    const a = document.createElement('a');
    a.href = doc.file_url;
    a.download = `${doc.title || 'document'}.jpg`;
    a.target = '_blank';
    a.click();
  };

  const printDocument = (doc: MedicalDocument) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Ошибка",
        description: "Разрешите всплывающие окна для печати",
        variant: "destructive",
      });
      return;
    }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${doc.title || 'Медицинский документ'}</title>
          <style>
            body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
            .header { margin-bottom: 20px; text-align: center; }
            .header h1 { font-size: 18px; margin: 0; }
            .header p { color: #666; margin: 5px 0 0; font-size: 12px; }
            img { max-width: 100%; height: auto; }
            @media print {
              body { padding: 0; }
              .header { margin-bottom: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${doc.title || 'Медицинский документ'}</h1>
            ${doc.document_date ? `<p>Дата: ${format(new Date(doc.document_date), "dd.MM.yyyy", { locale: ru })}</p>` : ''}
          </div>
          <img src="${doc.file_url}" alt="${doc.title || 'Документ'}" onload="setTimeout(() => { window.print(); window.close(); }, 500);" />
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1" /> 
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const getCategoryColor = (category: string | null) => {
    if (!category) return "secondary";
    switch (category.toUpperCase()) {
      case "А": return "default";
      case "Б": return "secondary";
      case "В": return "destructive";
      case "Г": return "outline";
      case "Д": return "destructive";
      default: return "secondary";
    }
  };

  const filteredDocuments = documents
    .filter(doc => {
      if (filterType !== "all" && doc.document_type_id !== filterType) return false;
      if (searchQuery && doc.title && !doc.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal: string | null = null;
      let bVal: string | null = null;

      switch (sortField) {
        case "uploaded_at":
          aVal = a.uploaded_at;
          bVal = b.uploaded_at;
          break;
        case "document_date":
          aVal = a.document_date;
          bVal = b.document_date;
          break;
        case "title":
          aVal = a.title;
          bVal = b.title;
          break;
      }

      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      const comparison = aVal.localeCompare(bVal);
      return sortDirection === "asc" ? comparison : -comparison;
    });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Медицинские документы</h1>
              <p className="text-muted-foreground">
                Загружайте документы — ИИ автоматически извлечёт текст, определит тип и оценит категорию годности
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              Назад в кабинет
            </Button>
          </div>

          {/* Drag & Drop Zone */}
          <Card className="mb-8">
            <CardContent className="p-0">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  relative border-2 border-dashed rounded-lg p-12 text-center transition-all
                  ${isDragOver 
                    ? "border-primary bg-primary/5" 
                    : "border-muted-foreground/25 hover:border-primary/50"
                  }
                `}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                    <p className="text-lg font-medium">Загрузка и конвертация...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <Upload className={`h-12 w-12 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                    <p className="text-lg font-medium mb-2">
                      Перетащите файлы сюда
                    </p>
                    <p className="text-muted-foreground mb-4">
                      или нажмите для выбора файлов
                    </p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Поддерживаемые форматы: PDF, JPEG, PNG, WebP
                    </p>
                    <p className="text-xs text-primary">
                      ИИ автоматически: извлечёт текст • определит тип и дату • оценит категорию годности
                    </p>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Фильтры:</span>
                </div>
                
                <div className="flex-1 min-w-[200px] max-w-xs">
                  <Input
                    placeholder="Поиск по названию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9"
                  />
                </div>

                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue placeholder="Тип документа" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    {documentTypes.map(type => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(filterType !== "all" || searchQuery) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setFilterType("all");
                      setSearchQuery("");
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Сбросить
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Documents Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Загруженные документы ({filteredDocuments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredDocuments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  {documents.length === 0 
                    ? "Нет загруженных документов. Перетащите файлы в зону выше." 
                    : "Документы не найдены по заданным фильтрам"
                  }
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead 
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => toggleSort("title")}
                        >
                          <div className="flex items-center">
                            Название {getSortIcon("title")}
                          </div>
                        </TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => toggleSort("document_date")}
                        >
                          <div className="flex items-center">
                            Дата {getSortIcon("document_date")}
                          </div>
                        </TableHead>
                        <TableHead>Категория</TableHead>
                        <TableHead>Шанс В</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocuments.map((doc) => (
                        <TableRow key={doc.id} className="group">
                          <TableCell className="font-medium max-w-[250px]">
                            <div className="truncate">{doc.title || "Без названия"}</div>
                            {doc.disease_articles_565 && (
                              <div className="text-xs text-primary mt-1">
                                Статья {doc.disease_articles_565.article_number}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.document_types ? (
                              <Badge variant="secondary" className="text-xs">
                                {doc.document_types.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.document_date 
                              ? format(new Date(doc.document_date), "dd.MM.yyyy", { locale: ru })
                              : <span className="text-muted-foreground">—</span>
                            }
                          </TableCell>
                          <TableCell>
                            {doc.ai_fitness_category ? (
                              <Badge variant={getCategoryColor(doc.ai_fitness_category)}>
                                {doc.ai_fitness_category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.ai_category_chance !== null ? (
                              <div className="flex items-center gap-2">
                                <Progress 
                                  value={doc.ai_category_chance} 
                                  className="w-16 h-2"
                                />
                                <span className="text-sm font-medium">
                                  {doc.ai_category_chance}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {analyzingId === doc.id ? (
                              <Badge variant="outline" className="animate-pulse">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Анализ...
                              </Badge>
                            ) : doc.is_classified ? (
                              <Badge variant="default">
                                <Check className="h-3 w-3 mr-1" />
                                Обработан
                              </Badge>
                            ) : (
                              <Badge variant="outline">Не обработан</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {/* View Details */}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => setSelectedDocument(doc)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                                  <DialogHeader>
                                    <DialogTitle>{doc.title || "Документ"}</DialogTitle>
                                  </DialogHeader>
                                  <ScrollArea className="max-h-[calc(90vh-100px)]">
                                    <div className="space-y-6 pr-4">
                                      {/* Document Image */}
                                      <div className="rounded-lg overflow-hidden border">
                                        <img 
                                          src={doc.file_url} 
                                          alt={doc.title || "Документ"} 
                                          className="w-full"
                                        />
                                      </div>

                                      {/* AI Analysis Results */}
                                      {doc.is_classified && (
                                        <>
                                          {/* Category and Chance */}
                                          <div className="grid grid-cols-2 gap-4">
                                            <Card>
                                              <CardHeader className="pb-2">
                                                <CardTitle className="text-sm">Категория годности</CardTitle>
                                              </CardHeader>
                                              <CardContent>
                                                <Badge 
                                                  variant={getCategoryColor(doc.ai_fitness_category)} 
                                                  className="text-lg px-4 py-2"
                                                >
                                                  Категория {doc.ai_fitness_category}
                                                </Badge>
                                              </CardContent>
                                            </Card>
                                            <Card>
                                              <CardHeader className="pb-2">
                                                <CardTitle className="text-sm">Шанс категории В</CardTitle>
                                              </CardHeader>
                                              <CardContent>
                                                <div className="flex items-center gap-3">
                                                  <Progress 
                                                    value={doc.ai_category_chance || 0} 
                                                    className="flex-1 h-4"
                                                  />
                                                  <span className="text-2xl font-bold">
                                                    {doc.ai_category_chance || 0}%
                                                  </span>
                                                </div>
                                              </CardContent>
                                            </Card>
                                          </div>

                                          {/* Explanation */}
                                          {doc.ai_explanation && (
                                            <Card>
                                              <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                  <Brain className="h-4 w-4" />
                                                  Обоснование ИИ
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent>
                                                <p className="text-sm text-muted-foreground">
                                                  {doc.ai_explanation}
                                                </p>
                                              </CardContent>
                                            </Card>
                                          )}

                                          {/* Recommendations */}
                                          {doc.ai_recommendations && doc.ai_recommendations.length > 0 && (
                                            <Card className="border-primary/50">
                                              <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2 text-primary">
                                                  <AlertCircle className="h-4 w-4" />
                                                  Рекомендации ИИ
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent>
                                                <ul className="space-y-2">
                                                  {doc.ai_recommendations.map((rec, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-sm">
                                                      <span className="text-primary font-bold">{idx + 1}.</span>
                                                      <span>{rec}</span>
                                                    </li>
                                                  ))}
                                                </ul>
                                              </CardContent>
                                            </Card>
                                          )}

                                          {/* Extracted Text */}
                                          {doc.raw_text && (
                                            <Card>
                                              <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center justify-between">
                                                  <span>Извлечённый текст</span>
                                                  <div className="flex gap-2">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => copyExtractedText(doc.raw_text!, doc.id)}
                                                    >
                                                      {copiedId === doc.id ? (
                                                        <Check className="h-4 w-4 mr-1" />
                                                      ) : (
                                                        <Copy className="h-4 w-4 mr-1" />
                                                      )}
                                                      Копировать
                                                    </Button>
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => downloadAsText(doc)}
                                                    >
                                                      <Download className="h-4 w-4 mr-1" />
                                                      Скачать .txt
                                                    </Button>
                                                  </div>
                                                </CardTitle>
                                              </CardHeader>
                                              <CardContent>
                                                <Textarea
                                                  value={doc.raw_text}
                                                  readOnly
                                                  className="min-h-[200px] text-sm font-mono"
                                                />
                                              </CardContent>
                                            </Card>
                                          )}

                                          {/* Link to Medical History */}
                                          {doc.linked_article_id && (
                                            <Button
                                              variant="outline"
                                              className="w-full"
                                              onClick={() => navigate(`/medical-history?article=${doc.disease_articles_565?.article_number}`)}
                                            >
                                              <ExternalLink className="h-4 w-4 mr-2" />
                                              Открыть в Истории болезни (Статья {doc.disease_articles_565?.article_number})
                                            </Button>
                                          )}
                                        </>
                                      )}

                                      {/* Actions */}
                                      <div className="flex gap-2 flex-wrap">
                                        <Button
                                          variant="outline"
                                          className="flex-1"
                                          onClick={() => downloadDocument(doc)}
                                        >
                                          <Download className="h-4 w-4 mr-2" />
                                          Скачать
                                        </Button>
                                        <Button
                                          variant="outline"
                                          className="flex-1"
                                          onClick={() => printDocument(doc)}
                                        >
                                          <Printer className="h-4 w-4 mr-2" />
                                          Печать
                                        </Button>
                                        {!doc.is_classified && (
                                          <Button
                                            className="flex-1"
                                            onClick={() => analyzeDocument(doc.id)}
                                            disabled={analyzingId === doc.id}
                                          >
                                            {analyzingId === doc.id ? (
                                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            ) : (
                                              <Brain className="h-4 w-4 mr-2" />
                                            )}
                                            Анализировать ИИ
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </ScrollArea>
                                </DialogContent>
                              </Dialog>

                              {/* Re-analyze */}
                              {doc.is_classified && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => analyzeDocument(doc.id)}
                                  disabled={analyzingId === doc.id}
                                  title="Повторить анализ"
                                >
                                  <Brain className="h-4 w-4" />
                                </Button>
                              )}

                              {/* Download */}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => downloadDocument(doc)}
                                title="Скачать"
                              >
                                <Download className="h-4 w-4" />
                              </Button>

                              {/* Print */}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => printDocument(doc)}
                                title="Печать"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>

                              {/* Delete */}
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleDeleteDocument(doc)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
