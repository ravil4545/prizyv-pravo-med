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
import { Upload, FileText, Loader2, Trash2, Download, Filter, ArrowUpDown, ArrowUp, ArrowDown, X, Eye } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  document_types?: DocumentType | null;
}

type SortField = "uploaded_at" | "document_date" | "title";
type SortDirection = "asc" | "desc";

const DocumentViewer = ({ fileUrl, fileName }: { fileUrl: string; fileName: string }) => {
  return (
    <img 
      src={fileUrl}
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
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Filters & Sorting
  const [filterType, setFilterType] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("uploaded_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchQuery, setSearchQuery] = useState("");

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
        document_types (id, code, name)
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
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("medical-documents")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("medical-documents")
          .getPublicUrl(fileName);

        const { error: insertError } = await supabase
          .from("medical_documents_v2")
          .insert({
            user_id: user.id,
            title: file.name,
            file_url: publicUrl,
            is_classified: false,
          });

        if (insertError) throw insertError;

        toast({
          title: "Документ загружен",
          description: file.name,
        });
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

  const handleDeleteDocument = async (doc: MedicalDocument) => {
    try {
      // Extract file path from URL for storage deletion
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

  // Filter and sort documents
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
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Медицинские документы</h1>
              <p className="text-muted-foreground">
                Загружайте и управляйте вашими медицинскими документами
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
                    <p className="text-lg font-medium">Загрузка документов...</p>
                  </div>
                ) : (
                  <>
                    <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="text-lg font-medium mb-2">
                      Перетащите файлы сюда
                    </p>
                    <p className="text-muted-foreground mb-4">
                      или нажмите для выбора файлов
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Поддерживаемые форматы: PDF, JPEG, PNG, WebP
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
                            Дата документа {getSortIcon("document_date")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => toggleSort("uploaded_at")}
                        >
                          <div className="flex items-center">
                            Загружен {getSortIcon("uploaded_at")}
                          </div>
                        </TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocuments.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium max-w-[300px] truncate">
                            {doc.title || "Без названия"}
                          </TableCell>
                          <TableCell>
                            {doc.document_types ? (
                              <Badge variant="secondary">
                                {doc.document_types.name}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.document_date 
                              ? format(new Date(doc.document_date), "dd MMM yyyy", { locale: ru })
                              : <span className="text-muted-foreground">—</span>
                            }
                          </TableCell>
                          <TableCell>
                            {format(new Date(doc.uploaded_at), "dd MMM yyyy, HH:mm", { locale: ru })}
                          </TableCell>
                          <TableCell>
                            {doc.is_classified ? (
                              <Badge variant="default">Классифицирован</Badge>
                            ) : (
                              <Badge variant="outline">Не обработан</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl max-h-[90vh]">
                                  <DialogHeader>
                                    <DialogTitle>{doc.title}</DialogTitle>
                                  </DialogHeader>
                                  <ScrollArea className="h-[70vh] w-full">
                                    <DocumentViewer fileUrl={doc.file_url} fileName={doc.title || "document"} />
                                  </ScrollArea>
                                </DialogContent>
                              </Dialog>
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                              >
                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" download>
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
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
