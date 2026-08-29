package com.kamadvice.backend.repository;

import com.kamadvice.backend.domain.GameServer;
import com.kamadvice.backend.domain.Item;
import com.kamadvice.backend.domain.PriceObservation;
import com.kamadvice.backend.domain.Profession;
import com.kamadvice.backend.domain.Recipe;
import com.kamadvice.backend.domain.RecipeIngredient;
import com.kamadvice.backend.domain.Resource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exercises the MVP data flow end to end at the persistence layer:
 * a recipe with a resource ingredient, a price observation for that
 * resource, and reading back the latest known price.
 */
@DataJpaTest
@ActiveProfiles("test")
class MvpWorkflowRepositoryTest {

    @Autowired
    private ProfessionRepository professionRepository;

    @Autowired
    private ItemRepository itemRepository;

    @Autowired
    private ResourceRepository resourceRepository;

    @Autowired
    private RecipeRepository recipeRepository;

    @Autowired
    private RecipeIngredientRepository recipeIngredientRepository;

    @Autowired
    private GameServerRepository gameServerRepository;

    @Autowired
    private PriceObservationRepository priceObservationRepository;

    @Test
    void recipeCanBeBuiltFromResourcesAndLatestPriceIsRetrievable() {
        Profession cordonnier = professionRepository.save(new Profession("Cordonnier"));
        Item bottes = itemRepository.save(new Item("Bottes en cuir", 68));
        Resource cuir = resourceRepository.save(new Resource("Cuir de Bouftou", 65));

        Recipe recipe = recipeRepository.save(new Recipe(cordonnier, bottes, 68));
        recipeIngredientRepository.save(RecipeIngredient.ofResource(recipe, cuir, 5));

        List<Recipe> recipesInRange =
                recipeRepository.findByProfessionIdAndLevelBetween(cordonnier.getId(), 65, 70);
        assertThat(recipesInRange).containsExactly(recipe);

        List<RecipeIngredient> ingredients = recipeIngredientRepository.findByRecipeId(recipe.getId());
        assertThat(ingredients).hasSize(1);
        assertThat(ingredients.get(0).getResource().getName()).isEqualTo("Cuir de Bouftou");
        assertThat(ingredients.get(0).getQuantity()).isEqualTo(5);

        GameServer server = gameServerRepository.save(new GameServer("Dakota"));

        priceObservationRepository.save(PriceObservation.forResource(
                server, cuir, 10, 500L, Instant.now().minusSeconds(60), "SCANNER"));
        priceObservationRepository.save(PriceObservation.forResource(
                server, cuir, 10, 450L, Instant.now(), "SCANNER"));

        List<PriceObservation> history = priceObservationRepository
                .findByResourceIdAndServerIdOrderByObservedAtDesc(cuir.getId(), server.getId());

        assertThat(history).hasSize(2);
        assertThat(history.get(0).getPrice()).isEqualTo(450L);
    }
}
