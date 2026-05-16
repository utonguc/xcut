using System.Security.Claims;
using XCut.Api.Data;
using XCut.Api.DTOs;
using XCut.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace XCut.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SurveyController : ControllerBase
{
    private readonly AppDbContext _db;

    public SurveyController(AppDbContext db) => _db = db;

    private Task<Guid?> GetSalonIdAsync()
    {
        var claim = User.FindFirstValue("salonId");
        return Task.FromResult(Guid.TryParse(claim, out var id) ? id : (Guid?)null);
    }

    // ── List surveys ─────────────────────────────────────────────────────────

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetAll()
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var rows = await _db.Surveys
            .Where(s => s.SalonId == salonId.Value)
            .OrderByDescending(s => s.CreatedAtUtc)
            .Select(s => new {
                s.Id, s.Title, s.Description, s.Status, s.CreatedAtUtc,
                QuestionCount = s.Questions.Count,
                ResponseCount = s.Responses.Count,
            })
            .ToListAsync();

        var surveyIds = rows.Select(s => s.Id).ToList();
        var ratingAnswers = await _db.SurveyAnswers
            .Where(a => surveyIds.Contains(a.Response!.SurveyId) && a.Question!.Type == "rating")
            .Select(a => new { SurveyId = a.Response!.SurveyId, a.Value })
            .ToListAsync();

        var avgBySurvey = ratingAnswers
            .GroupBy(a => a.SurveyId)
            .ToDictionary(g => g.Key,
                g => (double?)g.Select(x => double.TryParse(x.Value, out var v) ? v : 0).Average());

        return Ok(rows.Select(s => new SurveyListItemResponse
        {
            Id            = s.Id,
            Title         = s.Title,
            Description   = s.Description,
            Status        = s.Status,
            QuestionCount = s.QuestionCount,
            ResponseCount = s.ResponseCount,
            AvgRating     = avgBySurvey.GetValueOrDefault(s.Id),
            CreatedAtUtc  = s.CreatedAtUtc,
        }));
    }

    // ── Survey detail with questions ─────────────────────────────────────────

    [HttpGet("{id}")]
    [Authorize]
    public async Task<IActionResult> GetDetail(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var s = await _db.Surveys
            .Include(x => x.Questions.OrderBy(q => q.SortOrder))
            .Include(x => x.Responses)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);

        if (s is null) return NotFound();

        return Ok(new SurveyDetailResponse
        {
            Id            = s.Id,
            Title         = s.Title,
            Description   = s.Description,
            Status        = s.Status,
            QuestionCount = s.Questions.Count,
            ResponseCount = s.Responses.Count,
            AvgRating     = null,
            CreatedAtUtc  = s.CreatedAtUtc,
            Questions     = s.Questions.Select(q => new SurveyQuestionResponse
            {
                Id         = q.Id,
                SortOrder  = q.SortOrder,
                Text       = q.Text,
                Type       = q.Type,
                Options    = q.Options,
                IsRequired = q.IsRequired,
            }).ToList(),
        });
    }

    // ── Create survey ────────────────────────────────────────────────────────

    [HttpPost]
    [Authorize]
    public async Task<IActionResult> Create([FromBody] CreateSurveyRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var survey = new Survey
        {
            SalonId     = salonId.Value,
            Title       = req.Title.Trim(),
            Description = req.Description?.Trim(),
            Status      = "Active",
        };

        foreach (var (q, i) in req.Questions.Select((q, i) => (q, i)))
        {
            survey.Questions.Add(new SurveyQuestion
            {
                SortOrder  = q.SortOrder > 0 ? q.SortOrder : i + 1,
                Text       = q.Text.Trim(),
                Type       = q.Type,
                Options    = q.Options,
                IsRequired = q.IsRequired,
            });
        }

        _db.Surveys.Add(survey);
        await _db.SaveChangesAsync();
        return Ok(new { survey.Id });
    }

    // ── Update survey ────────────────────────────────────────────────────────

    [HttpPut("{id}")]
    [Authorize]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSurveyRequest req)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var survey = await _db.Surveys
            .Include(x => x.Questions)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);

        if (survey is null) return NotFound();

        survey.Title         = req.Title.Trim();
        survey.Description   = req.Description?.Trim();
        survey.Status        = req.Status;
        survey.UpdatedAtUtc  = DateTime.UtcNow;

        _db.SurveyQuestions.RemoveRange(survey.Questions);
        foreach (var (q, i) in req.Questions.Select((q, i) => (q, i)))
        {
            _db.SurveyQuestions.Add(new SurveyQuestion
            {
                SurveyId   = survey.Id,
                SortOrder  = q.SortOrder > 0 ? q.SortOrder : i + 1,
                Text       = q.Text.Trim(),
                Type       = q.Type,
                Options    = q.Options,
                IsRequired = q.IsRequired,
            });
        }

        await _db.SaveChangesAsync();
        return Ok();
    }

    // ── Toggle status ────────────────────────────────────────────────────────

    [HttpPatch("{id}/status")]
    [Authorize]
    public async Task<IActionResult> ToggleStatus(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var survey = await _db.Surveys.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (survey is null) return NotFound();

        survey.Status       = survey.Status == "Active" ? "Closed" : "Active";
        survey.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return Ok(new { survey.Status });
    }

    // ── Delete survey ────────────────────────────────────────────────────────

    [HttpDelete("{id}")]
    [Authorize]
    public async Task<IActionResult> Delete(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var survey = await _db.Surveys.FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (survey is null) return NotFound();

        _db.Surveys.Remove(survey);
        await _db.SaveChangesAsync();
        return Ok();
    }

    // ── Responses list ───────────────────────────────────────────────────────

    [HttpGet("{id}/responses")]
    [Authorize]
    public async Task<IActionResult> GetResponses(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var exists = await _db.Surveys.AnyAsync(x => x.Id == id && x.SalonId == salonId.Value);
        if (!exists) return NotFound();

        var responses = await _db.SurveyResponses
            .Include(r => r.Answers).ThenInclude(a => a.Question)
            .Where(r => r.SurveyId == id)
            .OrderByDescending(r => r.SubmittedAtUtc)
            .ToListAsync();

        return Ok(responses.Select(r => new SurveyResponseListItem
        {
            Id           = r.Id,
            CustomerName = r.CustomerName,
            Email        = r.Email,
            RatingAvg    = r.Answers.Any(a => a.Question?.Type == "rating")
                ? r.Answers.Where(a => a.Question?.Type == "rating")
                    .Select(a => double.TryParse(a.Value, out var v) ? v : 0)
                    .Average()
                : null,
            SubmittedAtUtc = r.SubmittedAtUtc,
            Answers = r.Answers.Select(a => new SurveyAnswerItem
            {
                QuestionText = a.Question?.Text ?? "",
                QuestionType = a.Question?.Type ?? "",
                Value        = a.Value,
            }).ToList(),
        }));
    }

    // ── Stats ────────────────────────────────────────────────────────────────

    [HttpGet("{id}/stats")]
    [Authorize]
    public async Task<IActionResult> GetStats(Guid id)
    {
        var salonId = await GetSalonIdAsync();
        if (salonId is null) return Unauthorized();

        var survey = await _db.Surveys
            .Include(x => x.Questions)
            .FirstOrDefaultAsync(x => x.Id == id && x.SalonId == salonId.Value);

        if (survey is null) return NotFound();

        var responses = await _db.SurveyResponses
            .Include(r => r.Answers)
            .Where(r => r.SurveyId == id)
            .ToListAsync();

        var ratingAnswers = responses
            .SelectMany(r => r.Answers)
            .Where(a => survey.Questions.Any(q => q.Id == a.QuestionId && q.Type == "rating"))
            .Select(a => double.TryParse(a.Value, out var v) ? v : 0)
            .ToList();

        double? avgRating = ratingAnswers.Any() ? ratingAnswers.Average() : null;

        var qStats = survey.Questions.Select(q =>
        {
            var answers = responses.SelectMany(r => r.Answers)
                .Where(a => a.QuestionId == q.Id)
                .ToList();

            var valueCounts = answers
                .GroupBy(a => a.Value ?? "")
                .ToDictionary(g => g.Key, g => g.Count());

            double? avg = q.Type == "rating" && answers.Any()
                ? answers.Select(a => double.TryParse(a.Value, out var v) ? v : 0).Average()
                : null;

            return new QuestionStatItem
            {
                QuestionId   = q.Id,
                QuestionText = q.Text,
                QuestionType = q.Type,
                AvgValue     = avg,
                ValueCounts  = valueCounts,
            };
        }).ToList();

        return Ok(new SurveyStatsResponse
        {
            TotalResponses = responses.Count,
            AvgRating      = avgRating,
            Positive       = ratingAnswers.Count(v => v >= 4),
            Neutral        = ratingAnswers.Count(v => v == 3),
            Negative       = ratingAnswers.Count(v => v <= 2),
            QuestionStats  = qStats,
        });
    }

    // ── Public submit (no auth) ──────────────────────────────────────────────

    [HttpPost("{id}/submit")]
    [AllowAnonymous]
    public async Task<IActionResult> Submit(Guid id, [FromBody] SubmitSurveyRequest req)
    {
        var survey = await _db.Surveys
            .Include(x => x.Questions)
            .FirstOrDefaultAsync(x => x.Id == id && x.Status == "Active");

        if (survey is null) return NotFound(new { message = "Anket bulunamadı veya kapatılmış." });

        var response = new SurveyResponse
        {
            SurveyId     = id,
            CustomerId   = req.CustomerId,
            CustomerName = req.CustomerName?.Trim(),
            Email        = req.Email?.Trim(),
        };

        foreach (var a in req.Answers)
        {
            var q = survey.Questions.FirstOrDefault(x => x.Id == a.QuestionId);
            if (q is null) continue;

            response.Answers.Add(new SurveyAnswer
            {
                QuestionId = a.QuestionId,
                Value      = a.Value?.Trim(),
            });
        }

        _db.SurveyResponses.Add(response);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Teşekkürler, yanıtınız kaydedildi." });
    }

    // ── Public survey detail (for filling) ──────────────────────────────────

    [HttpGet("{id}/public")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublic(Guid id)
    {
        var s = await _db.Surveys
            .Include(x => x.Questions.OrderBy(q => q.SortOrder))
            .FirstOrDefaultAsync(x => x.Id == id && x.Status == "Active");

        if (s is null) return NotFound(new { message = "Anket bulunamadı veya kapatılmış." });

        return Ok(new SurveyDetailResponse
        {
            Id            = s.Id,
            Title         = s.Title,
            Description   = s.Description,
            Status        = s.Status,
            QuestionCount = s.Questions.Count,
            ResponseCount = 0,
            CreatedAtUtc  = s.CreatedAtUtc,
            Questions     = s.Questions.Select(q => new SurveyQuestionResponse
            {
                Id         = q.Id,
                SortOrder  = q.SortOrder,
                Text       = q.Text,
                Type       = q.Type,
                Options    = q.Options,
                IsRequired = q.IsRequired,
            }).ToList(),
        });
    }
}
