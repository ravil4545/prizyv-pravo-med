"""
Генератор 4 PDF лид-магнитов для лендинга nepriziv.ru.
Контент проверен на соответствие действующему законодательству РФ
(ФЗ «О воинской обязанности и военной службе», Постановление Правительства №565,
КАС РФ) на май 2026. Не заменяет юридическую консультацию.

Запуск:
    python scripts/generate_leadmagnets.py

PDF сохраняются в public/leadmagnets/.
"""

import os
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    HRFlowable, KeepTogether,
)


# ---------- Шрифты с кириллицей -----------------------------------------------

FONT_DIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Arial", str(FONT_DIR / "arial.ttf")))
pdfmetrics.registerFont(TTFont("Arial-Bold", str(FONT_DIR / "arialbd.ttf")))
pdfmetrics.registerFont(TTFont("Arial-Italic", str(FONT_DIR / "ariali.ttf")))
pdfmetrics.registerFont(TTFont("Arial-BoldItalic", str(FONT_DIR / "arialbi.ttf")))
pdfmetrics.registerFontFamily(
    "Arial",
    normal="Arial",
    bold="Arial-Bold",
    italic="Arial-Italic",
    boldItalic="Arial-BoldItalic",
)


# ---------- Палитра в духе editorial --------------------------------------------

INK = colors.HexColor("#0a0a0a")
INK_SOFT = colors.HexColor("#4a4a4a")
GOLD = colors.HexColor("#b08d4a")
GOLD_DEEP = colors.HexColor("#8a6d35")
PAPER = colors.HexColor("#faf7f0")
PAPER_DEEP = colors.HexColor("#efe9d8")
RULE = colors.HexColor("#d8d2c4")
SEAL = colors.HexColor("#7d2a2a")


# ---------- Стили ---------------------------------------------------------------

def make_styles():
    base = getSampleStyleSheet()

    styles = {
        "doc_meta": ParagraphStyle(
            "doc_meta", parent=base["Normal"],
            fontName="Arial", fontSize=8, leading=11,
            textColor=GOLD_DEEP, spaceBefore=0, spaceAfter=2,
            alignment=TA_LEFT,
        ),
        "title": ParagraphStyle(
            "title", parent=base["Title"],
            fontName="Arial-Bold", fontSize=22, leading=28,
            textColor=INK, spaceBefore=2, spaceAfter=8,
            alignment=TA_LEFT,
        ),
        "subtitle": ParagraphStyle(
            "subtitle", parent=base["Normal"],
            fontName="Arial-Italic", fontSize=12, leading=16,
            textColor=GOLD_DEEP, spaceBefore=0, spaceAfter=12,
            alignment=TA_LEFT,
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"],
            fontName="Arial-Bold", fontSize=13, leading=17,
            textColor=INK, spaceBefore=14, spaceAfter=6,
            alignment=TA_LEFT,
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"],
            fontName="Arial-Bold", fontSize=10.5, leading=14,
            textColor=GOLD_DEEP, spaceBefore=8, spaceAfter=3,
            alignment=TA_LEFT,
        ),
        "body": ParagraphStyle(
            "body", parent=base["Normal"],
            fontName="Arial", fontSize=10, leading=14.5,
            textColor=INK, spaceBefore=0, spaceAfter=6,
            alignment=TA_JUSTIFY,
        ),
        "bullet": ParagraphStyle(
            "bullet", parent=base["Normal"],
            fontName="Arial", fontSize=10, leading=14,
            textColor=INK, spaceBefore=0, spaceAfter=4,
            alignment=TA_LEFT, leftIndent=14, bulletIndent=2,
        ),
        "note": ParagraphStyle(
            "note", parent=base["Normal"],
            fontName="Arial-Italic", fontSize=9, leading=12.5,
            textColor=INK_SOFT, spaceBefore=4, spaceAfter=4,
            alignment=TA_LEFT, leftIndent=10,
        ),
        "warn": ParagraphStyle(
            "warn", parent=base["Normal"],
            fontName="Arial-Bold", fontSize=10, leading=14,
            textColor=SEAL, spaceBefore=4, spaceAfter=4,
            alignment=TA_LEFT,
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["Normal"],
            fontName="Arial", fontSize=8.5, leading=11.5,
            textColor=INK_SOFT, alignment=TA_CENTER,
        ),
        "step_num": ParagraphStyle(
            "step_num", parent=base["Normal"],
            fontName="Arial-Bold", fontSize=18, leading=20,
            textColor=GOLD, alignment=TA_LEFT,
        ),
        "step_title": ParagraphStyle(
            "step_title", parent=base["Normal"],
            fontName="Arial-Bold", fontSize=11.5, leading=15,
            textColor=INK, spaceBefore=0, spaceAfter=3, alignment=TA_LEFT,
        ),
        "step_body": ParagraphStyle(
            "step_body", parent=base["Normal"],
            fontName="Arial", fontSize=9.5, leading=13.5,
            textColor=INK_SOFT, alignment=TA_LEFT,
        ),
        "template_body": ParagraphStyle(
            "template_body", parent=base["Normal"],
            fontName="Arial", fontSize=10, leading=15,
            textColor=INK, spaceBefore=4, spaceAfter=4,
            alignment=TA_LEFT,
        ),
        "template_placeholder": ParagraphStyle(
            "template_placeholder", parent=base["Normal"],
            fontName="Arial-Italic", fontSize=9.5, leading=14,
            textColor=GOLD_DEEP, alignment=TA_LEFT,
        ),
    }
    return styles


# ---------- Колонтитулы ---------------------------------------------------------

def page_decoration(canvas, doc, title_short: str):
    """Лёгкая editorial-рамка и нижний колонтитул."""
    canvas.saveState()

    # Top eyebrow
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.5)
    canvas.line(20 * mm, A4[1] - 15 * mm, A4[0] - 20 * mm, A4[1] - 15 * mm)

    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(GOLD_DEEP)
    canvas.drawString(20 * mm, A4[1] - 12 * mm, f"NEPRIZIV.RU · {title_short.upper()}")
    canvas.drawRightString(A4[0] - 20 * mm, A4[1] - 12 * mm, "досье · юрист")

    # Footer
    canvas.line(20 * mm, 15 * mm, A4[0] - 20 * mm, 15 * mm)
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(INK_SOFT)
    canvas.drawString(20 * mm, 11 * mm,
                      "Юрист по призывному праву · +7 (925) 350-05-33 · nepriziv.ru")
    canvas.drawRightString(A4[0] - 20 * mm, 11 * mm,
                           f"Стр. {doc.page}")
    canvas.restoreState()


def build_doc(filename: str, title_short: str, story: list, subject: str):
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=22 * mm, bottomMargin=22 * mm,
        title=subject,
        author="Важанина Александра Евгеньевна",
        subject=subject,
        creator="nepriziv.ru",
    )

    def on_page(canvas, doc):
        page_decoration(canvas, doc, title_short)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)


# ---------- Финальный CTA-блок (общий для всех PDF) ----------------------------

def cta_block(styles):
    block = []
    block.append(Spacer(1, 14))
    block.append(HRFlowable(width="100%", thickness=0.6, color=GOLD, spaceAfter=8))
    block.append(Paragraph("ДАЛЬНЕЙШИЙ ШАГ", styles["doc_meta"]))
    block.append(Paragraph(
        "Этот материал — навигатор. Конкретное решение для вашей ситуации требует "
        "анализа документов и личного дела.",
        styles["body"],
    ))
    block.append(Paragraph(
        "<b>Бесплатный разбор за 15 минут:</b><br/>"
        "Тел.: +7 (925) 350-05-33<br/>"
        "Telegram: t.me/nepriziv2<br/>"
        "WhatsApp: wa.me/79253500533",
        styles["body"],
    ))
    block.append(Paragraph(
        "Юрист Важанина А.Е. · 10+ лет защиты призывников · 500+ выигранных дел.",
        styles["note"],
    ))
    return block


# ---------- PDF 1: Чек-лист подготовки к медкомиссии ---------------------------

def build_checklist_medcomission(out_path: str):
    s = make_styles()
    story = []

    story.append(Paragraph("ЛИД-МАГНИТ № 01 · ПОДГОТОВКА", s["doc_meta"]))
    story.append(Paragraph("Чек-лист подготовки к медкомиссии", s["title"]))
    story.append(Paragraph(
        "— 9 пунктов, которые меняют исход освидетельствования.",
        s["subtitle"],
    ))
    story.append(Paragraph(
        "Медицинская комиссия в военкомате — это процедура, в которой 80% результата "
        "решается ДО входа в кабинет. Этот чек-лист собрал ошибки, которые я вижу в "
        "своей практике чаще всего, и действия, которые их предотвращают.",
        s["body"],
    ))
    story.append(Spacer(1, 6))

    items = [
        (
            "01", "Соберите медицинскую карту из поликлиники по месту прикрепления",
            "По письменному заявлению — копия амбулаторной карты выдаётся в течение 30 "
            "дней (ФЗ-323, ст. 22). Все обращения, диагнозы и направления за последние "
            "3–5 лет должны быть на руках до явки в военкомат."
        ),
        (
            "02", "Получите выписки из стационаров",
            "Каждая госпитализация — это документальное подтверждение хронического "
            "характера заболевания. Запросите выписки в архивах больниц, где лежали. "
            "Особенно ценны выписки старше 1 года."
        ),
        (
            "03", "Соберите результаты независимых обследований",
            "Если диагноз не зафиксирован в гос. поликлинике — обследуйтесь в платной "
            "клинике с лицензией Росздравнадзора. Военкомат обязан учитывать такие "
            "документы, если они оформлены правильно (печать, ФИО врача, дата, "
            "лицензия)."
        ),
        (
            "04", "Проверьте диагноз по Постановлению Правительства РФ № 565",
            "Не каждый диагноз даёт категорию «В». Важны критерии степени тяжести и "
            "функциональных нарушений. Каждой статье соответствуют конкретные "
            "параметры (углы Кобба для сколиоза, СМАД для гипертонии, спирометрия "
            "для астмы и т. д.)."
        ),
        (
            "05", "Сделайте 3 копии каждого документа",
            "Один комплект — себе, один — в военкомат, один — резервный (на случай "
            "«потери»). Никогда не отдавайте оригиналы в военкомат — только заверенные "
            "у нотариуса копии или предъявление для сверки."
        ),
        (
            "06", "Составьте письменное заявление о приобщении документов к личному делу",
            "Передача документов «из рук в руки» — не доказательство. Только письменное "
            "заявление в 2 экземплярах с входящим номером и подписью принявшего "
            "сотрудника. Один экземпляр — себе."
        ),
        (
            "07", "Заранее знайте свою категорию по Расписанию болезней",
            "Если вы пришли с уверенностью «у меня ст. 66 г, должна быть категория В», "
            "ВВК работает в правовом поле. Если пришли «авось разберутся» — получите "
            "Б-3 или А."
        ),
        (
            "08", "Идите с сопровождающим, который ведёт записи",
            "По закону (ст. 5.1 ФЗ-53) призывник имеет право прийти с адвокатом или "
            "представителем по доверенности. Простое присутствие свидетеля резко "
            "снижает вероятность процедурных нарушений."
        ),
        (
            "09", "Зафиксируйте отказы письменно",
            "Если врач отказывается смотреть ваши документы, ставить диагноз или "
            "направлять на дополнительное обследование — требуйте письменный отказ. "
            "Устные отказы не существуют для суда."
        ),
    ]

    for num, head, body in items:
        row = Table(
            [[Paragraph(num, s["step_num"]),
              [Paragraph(head, s["step_title"]),
               Paragraph(body, s["step_body"])]]],
            colWidths=[14 * mm, None],
        )
        row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(KeepTogether(row))

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "ТИПИЧНЫЕ ОШИБКИ",
        s["doc_meta"],
    ))
    story.append(HRFlowable(width="40%", thickness=0.5, color=RULE))
    for err in [
        "Идти «без бумажек» в надежде, что ВВК сама разберётся.",
        "Отдавать оригиналы без описи и расписки.",
        "Подписывать формуляры, не читая их полностью.",
        "Соглашаться на «доп. обследование» без уточнения статьи 565 и сроков.",
        "Терпеть процедурные нарушения молча, не фиксируя их письменно.",
    ]:
        story.append(Paragraph(f"▸ {err}", s["bullet"]))

    story.extend(cta_block(s))

    build_doc(
        out_path,
        title_short="чек-лист медкомиссии",
        story=story,
        subject="Чек-лист подготовки к медкомиссии — nepriziv.ru",
    )


# ---------- PDF 2: План на день получения повестки ------------------------------

def build_guide_povestka(out_path: str):
    s = make_styles()
    story = []

    story.append(Paragraph("ЛИД-МАГНИТ № 02 · СРОЧНОЕ", s["doc_meta"]))
    story.append(Paragraph("Что делать в день получения повестки", s["title"]))
    story.append(Paragraph(
        "— план на 72 часа: что подписывать, что нет, кому звонить.",
        s["subtitle"],
    ))

    story.append(Paragraph(
        "В первые сутки после получения повестки решается, на каких условиях вы войдёте "
        "в военкомат. Этот план — то, что я говорю клиентам в первые 10 минут разговора. "
        "Следуйте по часам.",
        s["body"],
    ))

    # Час 0
    story.append(Paragraph("ЧАС 0 · ПОЛУЧЕНИЕ ПОВЕСТКИ", s["h2"]))
    story.append(Paragraph(
        "Повестка считается врученной только если она передана <b>лично в руки под "
        "роспись</b>. Бросили в почтовый ящик, отдали родителям, оставили под дверью — "
        "<b>не вручена</b> (ст. 31 ФЗ-53, Постановление Правительства РФ № 663).",
        s["body"],
    ))
    story.append(Paragraph(
        "Если повестка пришла «электронно» через Госуслуги или Реестр воинского учёта — "
        "с 2023 года это считается надлежащим вручением, но сохраняются сроки (повестка "
        "вступает в силу через 7 дней после публикации в реестре).",
        s["body"],
    ))
    story.append(Paragraph(
        "Что подписать: <b>только факт получения</b> в корешке повестки.",
        s["warn"],
    ))
    story.append(Paragraph(
        "Что НЕ подписывать: согласие на службу, отказ от обжалования, отказ от "
        "медобследования, любые «памятки» с обязательствами.",
        s["warn"],
    ))

    # Час 1-2
    story.append(Paragraph("ЧАС 1–2 · ФИКСАЦИЯ И ЗВОНКИ", s["h2"]))
    story.append(Paragraph("▸ Сфотографируйте обе стороны повестки и корешка.", s["bullet"]))
    story.append(Paragraph(
        "▸ Запишите ФИО и должность сотрудника, который вручил. Если был свидетель — "
        "его контакты.", s["bullet"],
    ))
    story.append(Paragraph(
        "▸ Позвоните юристу или напишите в Telegram. Опишите ситуацию: какая "
        "формулировка в графе «Вы вызываетесь...», на какую дату, какой военкомат.",
        s["bullet"],
    ))

    # Час 3-12
    story.append(Paragraph("ЧАС 3–12 · ДОКУМЕНТАЛЬНАЯ ПОДГОТОВКА", s["h2"]))
    story.append(Paragraph(
        "Откройте свою амбулаторную карту, найдите ВСЕ обращения к врачам "
        "за последние 5 лет. Особенно ценны:",
        s["body"],
    ))
    for item in [
        "Обращения к узким специалистам (невролог, ортопед, кардиолог, психиатр и др.)",
        "Госпитализации — даже однодневные.",
        "Травмы с записями в травмпункте.",
        "Хронические диагнозы, поставленные не вам напрямую (повторные обращения).",
    ]:
        story.append(Paragraph(f"▸ {item}", s["bullet"]))

    story.append(Paragraph(
        "Соберите оригиналы или копии. Если на руках нет — запросите выписку из "
        "поликлиники (по заявлению, срок до 30 дней — иногда успеваете до явки).",
        s["body"],
    ))

    story.append(PageBreak())

    # День 2
    story.append(Paragraph("ДЕНЬ 2 · СТРАТЕГИЯ", s["h2"]))
    story.append(Paragraph(
        "С юристом определяется стратегия: какие документы предъявить, какие "
        "придержать для апелляции, нужны ли дополнительные обследования в платной "
        "клинике, нужно ли заранее писать заявление о приобщении документов.",
        s["body"],
    ))
    story.append(Paragraph(
        "Сценариев три:", s["h3"],
    ))
    for sc in [
        "<b>Документы железные</b> — идёте с полным комплектом и устной разъяснительной "
        "позицией. ВВК даёт «В» в этот же день или направляет на дополнительное обследование.",
        "<b>Документы есть, но «слабые»</b> — идёте с тем, что есть, фиксируете отказ ВВК "
        "учитывать их, обжалуете решение в комиссию субъекта (10 дней) и/или суд (3 месяца).",
        "<b>Документов нет</b> — собираете их на стадии обжалования; до этого требуете "
        "направления от ВВК на полное обследование (ст. 5.1 ФЗ-53 — обязанность ВВК).",
    ]:
        story.append(Paragraph(f"▸ {sc}", s["bullet"]))

    # День 3
    story.append(Paragraph("ДЕНЬ 3 · ПОДГОТОВКА ЗАЯВЛЕНИЙ", s["h2"]))
    story.append(Paragraph(
        "За день до явки готовятся <b>письменные заявления</b> в 2 экземплярах:",
        s["body"],
    ))
    for item in [
        "Заявление о приобщении медицинских документов к личному делу.",
        "Заявление о направлении на дополнительное медицинское обследование "
        "(если документы спорные).",
        "Заявление о праве присутствия представителя по доверенности.",
        "Заявление о ведении аудиозаписи (на основании ст. 8 ФЗ-152 «О персональных данных»).",
    ]:
        story.append(Paragraph(f"▸ {item}", s["bullet"]))

    # Что НЕ делать
    story.append(Paragraph("ЧЕГО НЕ ДЕЛАТЬ НИКОГДА", s["h2"]))
    story.append(Paragraph(
        "▸ Не игнорировать повестку. Это статья 21.5 КоАП (штраф) или ст. 328 УК "
        "(уголовка за уклонение, до 2 лет).", s["warn"],
    ))
    story.append(Paragraph(
        "▸ Не покупать «справку». Это статья 327 УК (подделка документов).", s["warn"],
    ))
    story.append(Paragraph(
        "▸ Не «договариваться» через посредников из военкомата. Это статья 290 УК "
        "(взятка) — для обеих сторон.", s["warn"],
    ))
    story.append(Paragraph(
        "▸ Не подписывать признание годности до полного обследования.", s["warn"],
    ))

    story.extend(cta_block(s))

    build_doc(
        out_path,
        title_short="день повестки",
        story=story,
        subject="Что делать в день получения повестки — nepriziv.ru",
    )


# ---------- PDF 3: Матрица «диагноз → статья 565» -----------------------------

def build_matrix_565(out_path: str):
    s = make_styles()
    story = []

    story.append(Paragraph("ЛИД-МАГНИТ № 03 · СПРАВОЧНИК", s["doc_meta"]))
    story.append(Paragraph("Матрица: диагноз → статья 565", s["title"]))
    story.append(Paragraph(
        "— 40 частых диагнозов и их привязка к Расписанию болезней.",
        s["subtitle"],
    ))
    story.append(Paragraph(
        "Это рабочая таблица из моей практики. Она <b>не подменяет</b> заключение "
        "ВВК и не означает, что ваш диагноз автоматически даёт указанную категорию: "
        "решение зависит от <b>степени тяжести и функциональных нарушений</b>, описанных "
        "в подпунктах статьи. Используйте её как навигатор: понять, на какую статью "
        "ориентироваться при сборе документов.",
        s["body"],
    ))

    sections = [
        ("Опорно-двигательная система", [
            ("Сколиоз II–III степени (углы Кобба &gt; 17°)", "ст. 66 г",
             "Категория В при II ст. с функциональными нарушениями"),
            ("Плоскостопие III ст. с артрозом", "ст. 68 в",
             "Категория В; рентген обязательно с нагрузкой"),
            ("Кифоз/деформация позвоночника", "ст. 66 в",
             "В зависимости от степени"),
            ("Артроз тазобедренного сустава II ст.", "ст. 65 в",
             "Снимки и угол сужения щели"),
            ("Привычный вывих плеча (2+ за год)", "ст. 65 г",
             "Документы из травмпункта"),
            ("Перенесённый остеохондроз с грыжами Шморля", "ст. 66 в/г",
             "МРТ обязательно"),
        ]),
        ("Сердечно-сосудистая система", [
            ("Гипертоническая болезнь II стадии", "ст. 43 б",
             "СМАД + поражение органов-мишеней"),
            ("Пролапс митрального клапана с регургитацией", "ст. 42 в",
             "ЭхоКГ"),
            ("Аритмии с пароксизмами", "ст. 42 в",
             "Холтер ЭКГ"),
            ("Вегето-сосудистая дистония по гипертоническому типу", "ст. 47 б",
             "Подтверждение неврологом + кардиологом"),
            ("Варикозная болезнь нижних конечностей III ст.", "ст. 45 в",
             "УЗДС вен"),
        ]),
        ("Нервная система и психика", [
            ("Тревожно-депрессивное расстройство", "ст. 17 в",
             "ПНД или клиника с лицензией"),
            ("Невротические расстройства затяжного течения", "ст. 17 б",
             "Длительность ≥ 6 мес."),
            ("Эпилепсия (любая форма)", "ст. 21",
             "ЭЭГ + наблюдение невролога"),
            ("Последствия черепно-мозговой травмы", "ст. 24 в/г",
             "МРТ + неврологический статус"),
            ("Энурез ночной (доказанный)", "ст. 87",
             "ПНД + урология"),
        ]),
        ("Дыхательная система", [
            ("Бронхиальная астма", "ст. 52 б/в",
             "Спирометрия с пробами, ФВД"),
            ("Хронический бронхит с обструкцией", "ст. 51 в",
             "ФВД, КТ при необходимости"),
            ("Аллергический ринит круглогодичный", "ст. 49 в",
             "Аллерголог + иммунолог"),
        ]),
        ("Желудочно-кишечный тракт", [
            ("Хронический гастродуоденит с обострениями", "ст. 59 в",
             "ФГДС + наблюдение гастро"),
            ("Язвенная болезнь желудка/12-п. кишки", "ст. 58 в",
             "ФГДС, рубцовая деформация"),
            ("Синдром раздражённого кишечника", "ст. 61 б",
             "Гастро + колоноскопия"),
            ("Желчнокаменная болезнь", "ст. 60 в",
             "УЗИ"),
            ("Хронический панкреатит", "ст. 59 в",
             "УЗИ + ферменты"),
        ]),
        ("Мочеполовая система", [
            ("Хронический пиелонефрит", "ст. 71 в",
             "2+ обострения в год, нефролог"),
            ("Мочекаменная болезнь", "ст. 72 в",
             "УЗИ, КТ"),
            ("Варикоцеле II–III ст.", "ст. 45 в",
             "УЗДС"),
        ]),
        ("Зрение и слух", [
            ("Близорукость от -6.0 D", "ст. 34 в",
             "Окулист + АРМ обследование"),
            ("Косоглазие с нарушением бинокулярного зрения", "ст. 35 в",
             "Окулист"),
            ("Хронический отит", "ст. 38 в",
             "ЛОР + аудиометрия"),
            ("Снижение слуха (тугоухость II ст.)", "ст. 40 в",
             "Аудиограмма"),
        ]),
        ("Кожа и эндокринная система", [
            ("Псориаз распространённый", "ст. 62 в",
             "Дерматолог, документация рецидивов"),
            ("Атопический дерматит распространённый", "ст. 62 б/в",
             "Аллерголог"),
            ("Сахарный диабет I/II типа", "ст. 13",
             "Эндокринолог, лабораторно"),
            ("Заболевания щитовидной железы", "ст. 13 в",
             "Гормоны + УЗИ"),
            ("Ожирение III степени", "ст. 13 в",
             "ИМТ > 40"),
        ]),
    ]

    for section_title, rows in sections:
        story.append(Paragraph(section_title, s["h2"]))

        data = [["Диагноз", "Статья 565", "Что нужно для подтверждения"]]
        for diag, art, ev in rows:
            data.append([
                Paragraph(diag, s["body"]),
                Paragraph(f"<b>{art}</b>", s["body"]),
                Paragraph(ev, s["body"]),
            ])

        t = Table(
            data,
            colWidths=[70 * mm, 30 * mm, 70 * mm],
        )
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Arial-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("TEXTCOLOR", (0, 0), (-1, 0), PAPER),
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("ALIGN", (0, 0), (-1, 0), "LEFT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PAPER, PAPER_DEEP]),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Spacer(1, 4))

    story.append(Paragraph(
        "Подбор подпункта статьи (а/б/в/г) — это юридическая работа: один и тот же "
        "диагноз может попадать под разные категории годности в зависимости от степени. "
        "На бесплатном разборе сразу скажу, какой подпункт ваш.",
        s["note"],
    ))

    story.extend(cta_block(s))

    build_doc(
        out_path,
        title_short="матрица 565",
        story=story,
        subject="Матрица диагноз → статья 565 — nepriziv.ru",
    )


# ---------- PDF 4: Шаблон апелляции в комиссию субъекта -------------------------

def build_template_apellyaciya(out_path: str):
    s = make_styles()
    story = []

    story.append(Paragraph("ЛИД-МАГНИТ № 04 · ШАБЛОН", s["doc_meta"]))
    story.append(Paragraph("Шаблон апелляции в призывную комиссию субъекта РФ", s["title"]))
    story.append(Paragraph(
        "— готовый документ с пояснениями. Подставьте свои данные.",
        s["subtitle"],
    ))

    story.append(Paragraph(
        "Этот шаблон применяется, когда вы НЕ согласны с решением призывной комиссии "
        "<b>муниципального уровня</b> (вашего военкомата) и подаёте жалобу в призывную "
        "комиссию <b>субъекта РФ</b> (область/край/республика).",
        s["body"],
    ))
    story.append(Paragraph(
        "Срок подачи — <b>10 дней с момента ознакомления с решением</b> (ст. 28 ФЗ-53). "
        "До рассмотрения апелляции исполнение решения призывной комиссии "
        "приостанавливается.",
        s["warn"],
    ))
    story.append(Paragraph(
        "Курсивом выделены поля, которые вы подставляете под свою ситуацию.",
        s["note"],
    ))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GOLD))
    story.append(Spacer(1, 8))

    # Header
    story.append(Paragraph(
        "В Призывную комиссию <i>[наименование субъекта РФ]</i><br/>"
        "Адрес: <i>[адрес призывной комиссии субъекта]</i>",
        s["template_body"],
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "От <i>[ФИО полностью]</i>,<br/>"
        "<i>[дата рождения]</i> г. р.,<br/>"
        "проживающего по адресу: <i>[адрес регистрации]</i>,<br/>"
        "паспорт <i>[серия номер, кем и когда выдан]</i>,<br/>"
        "тел.: <i>[ваш телефон]</i>, email: <i>[ваш email]</i>",
        s["template_body"],
    ))
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "<b>ЖАЛОБА</b><br/>"
        "на решение призывной комиссии <i>[наименование военкомата]</i> "
        "от <i>[дата решения]</i>",
        ParagraphStyle("center_bold", parent=s["template_body"],
                       alignment=TA_CENTER, fontSize=11, leading=15),
    ))
    story.append(Spacer(1, 8))

    # Body
    story.append(Paragraph(
        "<i>[Дата]</i> решением призывной комиссии <i>[наименование военкомата]</i> мне "
        "была установлена категория годности к военной службе <b><i>[указать категорию: "
        "А, Б-1, Б-2, Б-3 и т. д.]</i></b> и принято решение о призыве на военную службу. "
        "С данным решением не согласен по следующим основаниям.",
        s["template_body"],
    ))

    story.append(Paragraph("1. Имеющиеся заболевания и их подтверждение", s["h3"]))
    story.append(Paragraph(
        "У меня диагностированы следующие заболевания, подтверждённые медицинскими "
        "документами: <i>[перечислить диагнозы с датами установления и наименованиями "
        "медицинских организаций]</i>.",
        s["template_body"],
    ))
    story.append(Paragraph(
        "В подтверждение прилагаю копии следующих медицинских документов: <i>[перечень "
        "выписок, заключений, результатов обследований с указанием дат и врачей]</i>.",
        s["template_body"],
    ))

    story.append(Paragraph("2. Применимая статья Расписания болезней", s["h3"]))
    story.append(Paragraph(
        "Согласно Постановлению Правительства РФ от 04.07.2013 № 565 (Положение о "
        "военно-врачебной экспертизе), мои заболевания подпадают под действие "
        "<b><i>[указать конкретные статьи и пункты, например: ст. 66 пункт «г»]</i></b>, "
        "что соответствует категории годности <b><i>[В — ограниченно годен / "
        "Д — не годен]</i></b>.",
        s["template_body"],
    ))

    story.append(Paragraph("3. Нарушения, допущенные призывной комиссией", s["h3"]))
    story.append(Paragraph(
        "При вынесении оспариваемого решения призывная комиссия допустила следующие "
        "нарушения: <i>[выбрать из списка ниже либо описать иные нарушения]</i>:",
        s["template_body"],
    ))
    for item in [
        "необоснованно не приняла к рассмотрению представленные мной медицинские документы;",
        "не направила меня на дополнительное медицинское обследование в нарушение "
        "п. 20 Положения о военно-врачебной экспертизе;",
        "не учла предыдущие обращения к врачам и установленные ранее диагнозы;",
        "не запросила сведения из медицинских организаций по моему месту жительства;",
        "вынесла решение без проведения полного медицинского освидетельствования;",
        "не разъяснила мне порядок обжалования решения.",
    ]:
        story.append(Paragraph(f"▸ {item}", s["template_body"]))

    story.append(Paragraph("4. Правовые основания", s["h3"]))
    story.append(Paragraph(
        "В соответствии с ч. 7 ст. 28 Федерального закона от 28.03.1998 № 53-ФЗ «О "
        "воинской обязанности и военной службе» решение призывной комиссии может быть "
        "обжаловано в призывную комиссию субъекта РФ. Согласно ч. 3 ст. 29 указанного "
        "Закона, до рассмотрения жалобы выполнение оспариваемого решения "
        "приостанавливается.",
        s["template_body"],
    ))

    story.append(PageBreak())

    story.append(Paragraph("ПРОШУ:", s["h2"]))
    story.append(Paragraph(
        "1. Отменить решение призывной комиссии <i>[наименование военкомата]</i> от "
        "<i>[дата]</i> об установлении мне категории годности к военной службе "
        "<i>[категория]</i> и о призыве на военную службу.",
        s["template_body"],
    ))
    story.append(Paragraph(
        "2. Направить меня на контрольное медицинское освидетельствование с учётом "
        "представленных медицинских документов и в соответствии с положениями "
        "Постановления Правительства РФ № 565.",
        s["template_body"],
    ))
    story.append(Paragraph(
        "3. По итогам контрольного освидетельствования установить мне категорию "
        "годности к военной службе, соответствующую характеру моего заболевания и "
        "статье <i>[номер статьи 565]</i> Расписания болезней.",
        s["template_body"],
    ))
    story.append(Paragraph(
        "4. До момента вынесения решения по настоящей жалобе приостановить исполнение "
        "решения призывной комиссии о призыве на военную службу.",
        s["template_body"],
    ))

    story.append(Paragraph("ПРИЛОЖЕНИЯ:", s["h3"]))
    for item in [
        "Копия повестки от <i>[дата]</i> — 1 экз.;",
        "Копия выписки из протокола призывной комиссии (при наличии) — 1 экз.;",
        "Копии медицинских документов: <i>[перечень с указанием количества листов]</i>;",
        "Иные документы: <i>[перечислить]</i>.",
    ]:
        story.append(Paragraph(f"▸ {item}", s["template_body"]))

    story.append(Spacer(1, 18))
    story.append(Paragraph(
        "«___» __________ 20___ г.&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        "_______________ / <i>[ФИО]</i>",
        s["template_body"],
    ))
    story.append(Paragraph(
        "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(подпись)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"
        "&nbsp;(расшифровка)",
        ParagraphStyle("sign_label", parent=s["note"], fontSize=8),
    ))

    # Notes
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GOLD))
    story.append(Paragraph("КАК ПОДАТЬ", s["h2"]))
    for item in [
        "<b>Лично</b> — в приёмной призывной комиссии субъекта (адрес есть на сайте военкомата). На вашем экземпляре поставят входящий номер.",
        "<b>Почтой</b> — заказным письмом с описью вложения и уведомлением о вручении. Дата подачи = дата отправки на штампе.",
        "<b>Через Госуслуги</b> — если у вас подтверждённая запись.",
        "<b>Через юриста</b> — по нотариальной доверенности.",
    ]:
        story.append(Paragraph(f"▸ {item}", s["bullet"]))

    story.append(Paragraph("ВАЖНО", s["h2"]))
    story.append(Paragraph(
        "▸ Сохраните копию жалобы с входящим номером — без неё суд не примет дело.",
        s["warn"],
    ))
    story.append(Paragraph(
        "▸ Если в течение 30 дней не вызвали на контрольное освидетельствование — это "
        "уже основание для административного иска по КАС РФ.",
        s["warn"],
    ))
    story.append(Paragraph(
        "▸ Шаблон — основа. Конкретные формулировки и приложения зависят от обстоятельств. "
        "Перед подачей проверьте текст с юристом, чтобы не дать комиссии повод для отказа "
        "по формальным основаниям.",
        s["warn"],
    ))

    story.extend(cta_block(s))

    build_doc(
        out_path,
        title_short="апелляция в комиссию субъекта",
        story=story,
        subject="Шаблон апелляции в призывную комиссию субъекта — nepriziv.ru",
    )


# ---------- main ---------------------------------------------------------------

def main():
    out_dir = Path(__file__).resolve().parent.parent / "public" / "leadmagnets"
    out_dir.mkdir(parents=True, exist_ok=True)

    targets = [
        ("checklist-medcomission.pdf", build_checklist_medcomission),
        ("guide-povestka.pdf", build_guide_povestka),
        ("matrix-565.pdf", build_matrix_565),
        ("template-apellyaciya.pdf", build_template_apellyaciya),
    ]

    for filename, builder in targets:
        out_path = str(out_dir / filename)
        builder(out_path)
        size = os.path.getsize(out_path)
        print(f"[OK] {filename}  ({size:,} bytes)")

    print(f"\nDone: {out_dir}")


if __name__ == "__main__":
    main()
